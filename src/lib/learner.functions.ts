import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sanitizeRichText } from "@/lib/rich-text";
import { canOpenLesson, claimDecision, orderUnlocks, ownsOrder, safeEqual } from "@/lib/learner-access";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Public learner endpoints. Buyers have no account: access is granted ONLY by a paid
 * digital_orders row + its secret access_token (the same link given after payment).
 * Everything is decided here on the server; private files are returned as short-lived
 * signed URLs only after the check. Unpublished lessons are never returned to buyers.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ident = z.string().regex(/^[a-z0-9-]{1,64}$/i);
const orderId = z.string().regex(UUID).optional();
const token = z.string().regex(/^[a-f0-9]{16,128}$/).optional();
const SIGN_SECONDS = 3600;

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
const admin = async (): Promise<Admin> => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

async function resolve(sb: Admin, product: string, o?: string, t?: string) {
  let q = sb.from("digital_products").select("id, slug, title, description, price, product_type, status, cover_path, file_path, file_name, organization_id");
  q = UUID.test(product) ? q.eq("id", product) : q.eq("slug", product.toLowerCase());
  const { data: p } = await q.maybeSingle();
  if (!p) return null;
  let purchased = false;
  let order: { id: string; buyer_name: string } | null = null;
  if (o && t) {
    const { data: ord } = await sb.from("digital_orders").select("id, access_token, status, product_id, buyer_name").eq("id", o).maybeSingle();
    if (orderUnlocks(ord, t, p.id)) { purchased = true; order = { id: ord!.id, buyer_name: ord!.buyer_name }; }
  }
  const productPublished = p.status === "published";
  // Without a valid purchase, only products still on sale are visible.
  if (!purchased && !productPublished) return null;
  return { p, purchased, order, productPublished };
}

async function sign(sb: Admin, path: string, download?: string | true) {
  const { data } = await sb.storage.from("digital-files").createSignedUrl(path, SIGN_SECONDS, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

type ResRow = { id: string; kind: string; role: string; name: string; description: string; file_path: string | null; file_name: string | null; mime_type: string | null; size_bytes: number | null; url: string | null; position: number };
async function deliverResources(sb: Admin, rows: ResRow[]) {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  return Promise.all(sorted.map(async (r) => ({
    id: r.id, kind: r.kind, role: r.role, name: r.name, description: r.description,
    file_name: r.file_name, mime_type: r.mime_type, size_bytes: r.size_bytes,
    url: r.kind === "link" ? r.url : r.file_path ? await sign(sb, r.file_path) : null,
    downloadUrl: r.kind === "file" && r.file_path ? await sign(sb, r.file_path, r.file_name ?? true) : null,
  })));
}

export const getCourse = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ product: ident, o: orderId, t: token }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const r = await resolve(sb, data.product, data.o, data.t);
    if (!r) return null;
    const { p, purchased, order, productPublished } = r;
    const [{ data: org }, { data: mods }, { data: les }] = await Promise.all([
      sb.from("organizations").select("name").eq("id", p.organization_id).maybeSingle(),
      sb.from("digital_modules").select("id, title, description, position, created_at").eq("product_id", p.id),
      sb.from("digital_lessons").select("id, module_id, title, is_free, is_published, position, created_at").eq("product_id", p.id).eq("is_published", true),
    ]);
    const byPos = <T extends { position: number; created_at: string }>(a: T, b: T) => a.position - b.position || a.created_at.localeCompare(b.created_at);
    const modules = (mods ?? []).sort(byPos);
    const modOrder = new Map(modules.map((m, i) => [m.id, i]));
    const lessons = (les ?? []).sort((a, b) => (modOrder.get(a.module_id)! - modOrder.get(b.module_id)!) || byPos(a, b));

    let completed: string[] = [];
    let lastLessonId: string | null = null;
    let downloads: Awaited<ReturnType<typeof deliverResources>> = [];
    let mainFile: { name: string; url: string | null } | null = null;
    if (purchased && order) {
      const [{ data: prog }, { data: st }, { data: res }] = await Promise.all([
        sb.from("digital_lesson_progress").select("lesson_id").eq("order_id", order.id),
        sb.from("digital_learning_state").select("last_lesson_id").eq("order_id", order.id).maybeSingle(),
        sb.from("digital_resources").select("id, kind, role, name, description, file_path, file_name, mime_type, size_bytes, url, position").eq("product_id", p.id).is("lesson_id", null),
      ]);
      completed = (prog ?? []).map((x) => x.lesson_id);
      lastLessonId = st?.last_lesson_id ?? null;
      downloads = await deliverResources(sb, (res ?? []) as ResRow[]);
      if (p.file_path) mainFile = { name: p.file_name ?? "Fichier principal", url: await sign(sb, p.file_path, p.file_name ?? true) };
    }
    let coverUrl: string | null = null;
    if (p.cover_path) coverUrl = (await sb.storage.from("digital-covers").createSignedUrl(p.cover_path, SIGN_SECONDS)).data?.signedUrl ?? null;

    return {
      product: { id: p.id, slug: p.slug, title: p.title, description: sanitizeRichText(p.description), type: p.product_type, coverUrl, shopName: org?.name ?? "", published: productPublished },
      purchased, buyerName: order?.buyer_name ?? null,
      modules: modules.map((m) => ({ id: m.id, title: m.title, description: m.description })),
      lessons: lessons.map((l) => ({ id: l.id, module_id: l.module_id, title: l.title, is_free: l.is_free, open: canOpenLesson(l, { purchased, productPublished }) })),
      completed, lastLessonId, downloads, mainFile,
    };
  });

export const getLesson = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ product: ident, lesson: z.string().regex(UUID), o: orderId, t: token }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const r = await resolve(sb, data.product, data.o, data.t);
    if (!r) return { ok: false as const, reason: "not_found" as const };
    const { data: l } = await sb.from("digital_lessons").select("id, product_id, title, content, is_free, is_published").eq("id", data.lesson).maybeSingle();
    // Same product only: a token for one product never opens another shop's / product's lesson.
    if (!l || l.product_id !== r.p.id || !l.is_published) return { ok: false as const, reason: "not_found" as const };
    if (!canOpenLesson(l, { purchased: r.purchased, productPublished: r.productPublished })) return { ok: false as const, reason: "locked" as const };
    const { data: res } = await sb.from("digital_resources").select("id, kind, role, name, description, file_path, file_name, mime_type, size_bytes, url, position").eq("lesson_id", l.id).eq("product_id", r.p.id);
    if (r.purchased && r.order) {
      await sb.from("digital_learning_state").upsert({ order_id: r.order.id, organization_id: r.p.organization_id, last_lesson_id: l.id, updated_at: new Date().toISOString() });
    }
    return { ok: true as const, lesson: { id: l.id, title: l.title, is_free: l.is_free, content: sanitizeRichText(l.content) }, resources: await deliverResources(sb, (res ?? []) as ResRow[]) };
  });

export const setLessonDone = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ product: ident, lesson: z.string().regex(UUID), o: z.string().regex(UUID), t: z.string().regex(/^[a-f0-9]{16,128}$/), done: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const r = await resolve(sb, data.product, data.o, data.t);
    if (!r?.purchased || !r.order) throw new Error("Accès refusé");
    const { data: l } = await sb.from("digital_lessons").select("id, product_id, is_published").eq("id", data.lesson).maybeSingle();
    if (!l || l.product_id !== r.p.id || !l.is_published) throw new Error("Leçon introuvable");
    if (data.done) {
      const { error } = await sb.from("digital_lesson_progress").upsert({ order_id: r.order.id, lesson_id: l.id, organization_id: r.p.organization_id });
      if (error) throw new Error("Enregistrement impossible");
    } else {
      await sb.from("digital_lesson_progress").delete().eq("order_id", r.order.id).eq("lesson_id", l.id);
    }
    return { ok: true };
  });

/** "Mes achats": summaries for purchase links saved on this device. Invalid or unpaid links are dropped. */
export const listMyPurchases = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ items: z.array(z.object({ id: z.string().regex(UUID), t: z.string().regex(/^[a-f0-9]{16,128}$/) })).max(30) }).parse(d))
  .handler(async ({ data }) => {
    if (!data.items.length) return [];
    const sb = await admin();
    const { data: orders } = await sb.from("digital_orders").select("id, access_token, status, product_id, product_title, product_type, paid_at, organization_id").in("id", data.items.map((i) => i.id));
    const valid = (orders ?? []).filter((o) => o.product_id && o.status === "paid" && safeEqual(o.access_token, data.items.find((i) => i.id === o.id)?.t));
    return Promise.all(valid.map(async (o) => {
      const [{ data: p }, { data: org }, { count: total }, { count: done }, { data: st }] = await Promise.all([
        sb.from("digital_products").select("id, slug, title, cover_path").eq("id", o.product_id!).maybeSingle(),
        sb.from("organizations").select("name").eq("id", o.organization_id).maybeSingle(),
        sb.from("digital_lessons").select("id", { count: "exact", head: true }).eq("product_id", o.product_id!).eq("is_published", true),
        sb.from("digital_lesson_progress").select("lesson_id", { count: "exact", head: true }).eq("order_id", o.id),
        sb.from("digital_learning_state").select("last_lesson_id").eq("order_id", o.id).maybeSingle(),
      ]);
      const coverUrl = p?.cover_path ? (await sb.storage.from("digital-covers").createSignedUrl(p.cover_path, SIGN_SECONDS)).data?.signedUrl ?? null : null;
      return {
        orderId: o.id, token: o.access_token, product: p?.slug ?? o.product_id!, title: p?.title ?? o.product_title, type: o.product_type,
        shopName: org?.name ?? "", paidAt: o.paid_at, coverUrl, lessonsTotal: total ?? 0, lessonsDone: Math.min(done ?? 0, total ?? 0), lastLessonId: st?.last_lesson_id ?? null,
      };
    }));
  });

async function verifiedUser(userId: string) {
  const sb = await admin();
  const { data } = await sb.auth.admin.getUserById(userId);
  const u = data?.user;
  return { sb, user: { id: userId, email: u?.email ?? null, emailVerified: !!u?.email_confirmed_at } };
}

/** Signed-in client library: only paid orders owned by the caller (claim or verified e-mail). */
export const listMyLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sb, user } = await verifiedUser(context.userId);
    const { data: claims } = await sb.from("digital_order_claims").select("order_id").eq("user_id", user.id);
    const claimedIds = (claims ?? []).map((c) => c.order_id);
    const cols = "id, access_token, status, product_id, product_title, product_type, buyer_email, paid_at, organization_id";
    const [byEmail, byClaim] = await Promise.all([
      user.emailVerified && user.email ? sb.from("digital_orders").select(cols).eq("status", "paid").ilike("buyer_email", user.email.replace(/[%_\\]/g, "\\$&")) : Promise.resolve({ data: [] as never[] }),
      claimedIds.length ? sb.from("digital_orders").select(cols).eq("status", "paid").in("id", claimedIds) : Promise.resolve({ data: [] as never[] }),
    ]);
    const all = new Map([...(byEmail.data ?? []), ...(byClaim.data ?? [])].map((o) => [o.id, o]));
    if (!all.size) return [];
    const { data: allClaims } = await sb.from("digital_order_claims").select("order_id, user_id").in("order_id", [...all.keys()]);
    const claimedBy = new Map((allClaims ?? []).map((c) => [c.order_id, c.user_id]));
    const owned = [...all.values()].filter((o) => o.product_id && ownsOrder({ status: o.status, buyer_email: o.buyer_email, claimedBy: claimedBy.get(o.id) ?? null }, user));
    const items = await Promise.all(owned.map(async (o) => {
      const [{ data: p }, { data: org }] = await Promise.all([
        sb.from("digital_products").select("id, slug, title, cover_path, organization_id").eq("id", o.product_id!).maybeSingle(),
        sb.from("organizations").select("name").eq("id", o.organization_id).maybeSingle(),
      ]);
      // The product must still exist and belong to the shop that sold it.
      if (!p || p.organization_id !== o.organization_id) return null;
      const coverUrl = p.cover_path ? (await sb.storage.from("digital-covers").createSignedUrl(p.cover_path, SIGN_SECONDS)).data?.signedUrl ?? null : null;
      return { orderId: o.id, token: o.access_token, product: p.slug ?? p.id, title: p.title, type: o.product_type, shopName: org?.name ?? "", paidAt: o.paid_at, coverUrl };
    }));
    return items.filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  });

/** Links a paid order (proved by its secret link) to the signed-in client's library. */
export const claimOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().regex(UUID), t: z.string().regex(/^[a-f0-9]{16,128}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { sb, user } = await verifiedUser(context.userId);
    const { data: o } = await sb.from("digital_orders").select("id, access_token, status, buyer_email").eq("id", data.id).maybeSingle();
    const { data: existing } = o ? await sb.from("digital_order_claims").select("user_id").eq("order_id", o.id).maybeSingle() : { data: null };
    const d = claimDecision(o, data.t, existing?.user_id ?? null, user);
    if (d === "invalid") throw new Error("Commande introuvable ou non payée");
    if (d === "taken") throw new Error("Cet achat est déjà rattaché à un autre compte client");
    if (d === "other_email") throw new Error("Cet achat a été fait avec une autre adresse e-mail. Connectez-vous avec l'e-mail utilisé lors de l'achat pour le retrouver.");
    if (d === "ok") {
      const { error } = await sb.from("digital_order_claims").insert({ order_id: o!.id, user_id: context.userId });
      if (error) throw new Error("Rattachement impossible");
    }
    return { ok: true };
  });
