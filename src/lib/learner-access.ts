// Pure rules for the buyer/learner space (shared by server functions and UI).

export type LessonAccessInput = { is_free: boolean; is_published: boolean };

/**
 * A lesson opens only when it is published AND either the visitor holds a paid order
 * for this product, or the lesson is free and the product is still published for sale.
 */
export function canOpenLesson(lesson: LessonAccessInput, ctx: { purchased: boolean; productPublished: boolean }): boolean {
  if (!lesson.is_published) return false;
  if (ctx.purchased) return true;
  return lesson.is_free && ctx.productPublished;
}

/** Constant-time string comparison for secret order tokens. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Who may attach a paid order (proved by its secret link) to their library:
 * - never an unpaid order or a wrong token;
 * - an order already attached stays with its first owner;
 * - an order bought with an e-mail can only be attached by the client whose verified e-mail matches,
 *   so a forwarded link can never take it away from the buyer's library.
 */
export function claimDecision(
  order: { access_token: string; status: string; buyer_email: string | null } | null | undefined,
  token: string,
  claimedBy: string | null,
  user: { id: string; email: string | null; emailVerified: boolean },
): "ok" | "already_mine" | "invalid" | "taken" | "other_email" {
  if (!order || !safeEqual(order.access_token, token) || order.status !== "paid") return "invalid";
  if (claimedBy) return claimedBy === user.id ? "already_mine" : "taken";
  const buyer = (order.buyer_email ?? "").trim().toLowerCase();
  if (buyer && !(user.emailVerified && (user.email ?? "").trim().toLowerCase() === buyer)) return "other_email";
  return "ok";
}

/** A paid order unlocks a product only with its exact secret token and matching product. */
export function orderUnlocks(
  order: { access_token: string; status: string; product_id: string | null } | null | undefined,
  token: string | undefined,
  productId: string,
): boolean {
  return !!order && !!token && safeEqual(order.access_token, token) && order.status === "paid" && order.product_id === productId;
}

/** Embeddable player URL for YouTube / Vimeo links, otherwise null. */
export function videoEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const idOk = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null);
  if (host === "youtu.be") { const id = idOk(u.pathname.slice(1).split("/")[0]); return id ? `https://www.youtube-nocookie.com/embed/${id}` : null; }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = idOk(u.searchParams.get("v")) ?? idOk(/^\/(embed|shorts|live)\/([^/?]+)/.exec(u.pathname)?.[2]);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = /(\d{6,12})/.exec(u.pathname)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

export function progressStats(lessons: { id: string; module_id: string }[], completed: Set<string>) {
  const done = lessons.filter((l) => completed.has(l.id)).length;
  const modules = new Map<string, { total: number; done: number }>();
  for (const l of lessons) {
    const m = modules.get(l.module_id) ?? { total: 0, done: 0 };
    m.total += 1; if (completed.has(l.id)) m.done += 1;
    modules.set(l.module_id, m);
  }
  const modulesDone = [...modules.values()].filter((m) => m.total > 0 && m.done === m.total).length;
  return { done, total: lessons.length, percent: lessons.length ? Math.round((done / lessons.length) * 100) : 0, modulesDone, modulesTotal: modules.size };
}

/** Lesson to resume: last viewed if still available, else first not completed, else first. */
export function resumeLesson(ordered: { id: string; open: boolean }[], last: string | null, completed: Set<string>): string | null {
  const open = ordered.filter((l) => l.open);
  if (last && open.some((l) => l.id === last)) return last;
  return open.find((l) => !completed.has(l.id))?.id ?? open[0]?.id ?? null;
}

export const PURCHASES_KEY = "gestipro:purchases";
export type SavedPurchase = { id: string; t: string };

/** Device-local list of purchase links (no buyer account exists). */
export function mergePurchases(list: SavedPurchase[], add: SavedPurchase): SavedPurchase[] {
  const rest = list.filter((p) => p.id !== add.id);
  return [add, ...rest].slice(0, 30);
}

/** Remembers a purchase link on this device (browser only). */
export function savePurchase(p: SavedPurchase) {
  try {
    const list = JSON.parse(localStorage.getItem(PURCHASES_KEY) ?? "[]") as SavedPurchase[];
    localStorage.setItem(PURCHASES_KEY, JSON.stringify(mergePurchases(Array.isArray(list) ? list : [], p)));
  } catch { /* storage unavailable: the purchase link still works */ }
}

/**
 * Library ownership: a PAID order belongs to a signed-in client when it was explicitly
 * claimed by them, or (if nobody claimed it) when its buyer e-mail equals their verified e-mail.
 */
export function ownsOrder(
  order: { status: string; buyer_email: string; claimedBy: string | null },
  user: { id: string; email: string | null; emailVerified: boolean },
): boolean {
  if (order.status !== "paid") return false;
  if (order.claimedBy) return order.claimedBy === user.id;
  const email = (user.email ?? "").trim().toLowerCase();
  return user.emailVerified && !!email && order.buyer_email.trim().toLowerCase() === email;
}
