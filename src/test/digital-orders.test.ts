import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the digital_orders table.
const order = { id: "11111111-1111-4111-8111-111111111111", amount: 2000, currency: "XOF", status: "pending", session_id: "sess-1" };
let row: typeof order & Record<string, unknown>;
const updates: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client.server", () => {
  const builder = () => {
    let patch: Record<string, unknown> | null = null;
    const filters: [string, unknown, boolean][] = [];
    const matches = () => filters.every(([k, v, neg]) => ((row as any)[k] === v) !== neg);
    const b: any = {
      select: () => b,
      update: (p: Record<string, unknown>) => { patch = p; return b; },
      eq: (k: string, v: unknown) => { filters.push([k, v, false]); return b; },
      neq: (k: string, v: unknown) => { filters.push([k, v, true]); return b; },
      maybeSingle: async () => ({ data: matches() ? row : null }),
      then: (resolve: (v: unknown) => void) => {
        if (patch && matches()) { updates.push(patch); Object.assign(row, patch); resolve({ data: [{ id: row.id }], error: null }); }
        else resolve({ data: [], error: null });
      },
    };
    return b;
  };
  return { supabaseAdmin: { from: () => builder() } };
});

const bkapay = (body: Record<string, unknown>) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body))));

describe("digital order payment confirmation", () => {
  beforeEach(() => {
    row = { ...order };
    updates.length = 0;
    process.env["BKAPAY_SECRET_KEY"] = "test";
  });

  it("marks the order paid only when BkaPay reports completed with the same order and amount", async () => {
    const { reconcileDigitalOrder } = await import("@/lib/bkapay.server");
    bkapay({ status: "completed", orderId: order.id, amount: 2000, currency: "XOF", transactionId: "tx-1" });
    expect(await reconcileDigitalOrder(order.id)).toBe("activated");
    expect(row.status).toBe("paid");
  });

  it("refuses a completed payment with a different amount", async () => {
    const { reconcileDigitalOrder } = await import("@/lib/bkapay.server");
    bkapay({ status: "completed", orderId: order.id, amount: 500, currency: "XOF" });
    expect(await reconcileDigitalOrder(order.id)).toBe("mismatch");
    expect(row.status).toBe("pending");
  });

  it("never marks paid while BkaPay says pending, and records failures", async () => {
    const { reconcileDigitalOrder } = await import("@/lib/bkapay.server");
    bkapay({ status: "pending" });
    expect(await reconcileDigitalOrder(order.id)).toBe("pending");
    expect(row.status).toBe("pending");
    bkapay({ status: "failed" });
    expect(await reconcileDigitalOrder(order.id)).toBe("failed");
    expect(row.status).toBe("failed");
  });

  it("does not activate twice", async () => {
    const { reconcileDigitalOrder } = await import("@/lib/bkapay.server");
    row.status = "paid";
    bkapay({ status: "completed", orderId: order.id, amount: 2000, currency: "XOF" });
    expect(await reconcileDigitalOrder(order.id)).toBe("already_paid");
    expect(updates).toHaveLength(0);
  });
});