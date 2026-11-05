import { describe, expect, it, vi } from "vitest";
import { ownsFormation, readLearnerProgress, writeLearnerActivity } from "@/lib/learner-progress.server";
import type { PurchaseAdmin } from "@/lib/purchase-access.server";

type Row = Record<string, unknown>;
function database() {
  const tables: Record<string, Row[]> = {
    digital_products: [{ id: "product", slug: "course", organization_id: "shop", product_type: "formation" }],
    digital_orders: [{ id: "order", status: "paid", product_id: "product", organization_id: "shop", buyer_email: "buyer@example.test" }],
    digital_order_claims: [{ order_id: "order", user_id: "owner" }],
    digital_lessons: ["a", "b"].map((id, i) => ({ id, module_id: "module", product_id: "product", organization_id: "shop", is_published: true, position: i, created_at: "2026-11-05" })),
    digital_modules: [{ id: "module", product_id: "product", organization_id: "shop", position: 0, created_at: "2026-11-05" }],
    digital_learner_lessons: [], digital_learner_courses: [],
  };
  let clock = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const result = () => ({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null });
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return q; },
      order: () => q,
      maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return q;
  };
  const rpc = vi.fn(async (_name: string, args: Record<string, string>) => {
    const now = `2026-11-05T07:${String(clock++).padStart(2, "0")}:00Z`;
    let row = tables["digital_learner_lessons"]?.find((r) => r["user_id"] === args["_user"] && r["product_id"] === args["_product"] && r["lesson_id"] === args["_lesson"]);
    if (!row) {
      row = { user_id: args["_user"], product_id: args["_product"], organization_id: args["_organization"], lesson_id: args["_lesson"], first_viewed_at: null, last_viewed_at: null, is_completed: false, completed_at: null };
      tables["digital_learner_lessons"]?.push(row);
    }
    if (args["_action"] === "view") {
      row["first_viewed_at"] ??= now; row["last_viewed_at"] = now;
      let state = tables["digital_learner_courses"]?.find((r) => r["user_id"] === args["_user"] && r["product_id"] === args["_product"]);
      if (!state) { state = { user_id: args["_user"], product_id: args["_product"], organization_id: args["_organization"], first_viewed_at: now }; tables["digital_learner_courses"]?.push(state); }
      state["last_lesson_id"] = args["_lesson"]; state["last_viewed_at"] = now;
    } else {
      if (args["_action"] === "done" && !row["is_completed"]) row["completed_at"] = now;
      row["is_completed"] = args["_action"] === "done";
    }
    return { error: null };
  });
  const sb = { from, rpc, auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: id === "owner" ? "buyer@example.test" : "other@example.test", email_confirmed_at: "2026-11-05" } }, error: null }) } } } as unknown as PurchaseAdmin;
  return { sb, tables, rpc };
}

describe("individual progress server (in-memory adapter, not production)", () => {
  it("persists view history, keeps first view and updates last view", async () => {
    const { sb, tables } = database();
    expect((await writeLearnerActivity(sb, "owner", "course", "a", "view")).status).toBe("En cours");
    await writeLearnerActivity(sb, "owner", "course", "a", "view");
    expect(tables["digital_learner_lessons"]).toHaveLength(1);
    expect(tables["digital_learner_lessons"]?.[0]).toMatchObject({ first_viewed_at: "2026-11-05T07:00:00Z", last_viewed_at: "2026-11-05T07:01:00Z" });
  });
  it("same user rereads completion and resume through a fresh client", async () => {
    const { sb } = database();
    await writeLearnerActivity(sb, "owner", "course", "b", "view");
    await writeLearnerActivity(sb, "owner", "course", "b", "done");
    const freshClient = { from: sb.from.bind(sb), rpc: sb.rpc.bind(sb), auth: sb.auth } as unknown as PurchaseAdmin;
    const reread = await readLearnerProgress(freshClient, "owner", "product", "shop");
    expect([reread.done, reread.percent, reread.lastLessonId]).toEqual([1, 50, "b"]);
  });
  it("completion is idempotent and undo keeps history", async () => {
    const { sb, tables } = database();
    await writeLearnerActivity(sb, "owner", "course", "a", "view");
    await writeLearnerActivity(sb, "owner", "course", "a", "done");
    await writeLearnerActivity(sb, "owner", "course", "a", "done");
    expect(tables["digital_learner_lessons"]).toHaveLength(1);
    expect((await writeLearnerActivity(sb, "owner", "course", "a", "undone")).done).toBe(0);
    expect(tables["digital_learner_lessons"]?.[0]?.["completed_at"]).toBe("2026-11-05T07:01:00Z");
  });
  it("all published lessons completed means 100 percent and Terminée", async () => {
    const { sb } = database();
    await writeLearnerActivity(sb, "owner", "course", "a", "done");
    const s = await writeLearnerActivity(sb, "owner", "course", "b", "done");
    expect([s.done, s.total, s.percent, s.status]).toEqual([2, 2, 100, "Terminée"]);
  });
  it("another client cannot read owner history through their own scope or write", async () => {
    const { sb, rpc } = database();
    await writeLearnerActivity(sb, "owner", "course", "a", "done");
    expect((await readLearnerProgress(sb, "other", "product", "shop")).history).toEqual([]);
    await expect(writeLearnerActivity(sb, "other", "course", "a", "done")).rejects.toThrow("Accès refusé");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("unpublished lessons cannot be recorded or counted", async () => {
    const { sb, tables, rpc } = database();
    const lesson = tables["digital_lessons"]?.[0]; if (!lesson) throw new Error("Missing fixture"); lesson["is_published"] = false;
    await expect(writeLearnerActivity(sb, "owner", "course", "a", "done")).rejects.toThrow("Leçon inaccessible");
    expect((await readLearnerProgress(sb, "owner", "product", "shop")).total).toBe(1);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("unpaid formation refuses all recording", async () => {
    const { sb, tables, rpc } = database();
    const order = tables["digital_orders"]?.[0]; if (!order) throw new Error("Missing fixture"); order["status"] = "pending";
    await expect(writeLearnerActivity(sb, "owner", "course", "a", "view")).rejects.toThrow("Accès refusé");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("shop mismatch does not authorize progression", async () => {
    const { sb, tables, rpc } = database();
    const order = tables["digital_orders"]?.[0]; if (!order) throw new Error("Missing fixture"); order["organization_id"] = "other-shop";
    expect(await ownsFormation(sb, "owner", "product", "shop")).toBe(false);
    await expect(writeLearnerActivity(sb, "owner", "course", "a", "done")).rejects.toThrow("Accès refusé");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("verified email owns an unclaimed purchase but another account never does", async () => {
    const { sb, tables } = database(); tables["digital_order_claims"] = [];
    expect(await ownsFormation(sb, "owner", "product", "shop")).toBe(true);
    expect(await ownsFormation(sb, "other", "product", "shop")).toBe(false);
  });
  it("database errors are reported instead of claiming a successful save", async () => {
    const { sb, rpc } = database(); rpc.mockResolvedValueOnce({ error: new Error("offline") } as never);
    await expect(writeLearnerActivity(sb, "owner", "course", "a", "done")).rejects.toThrow("enregistrement impossible");
  });
});