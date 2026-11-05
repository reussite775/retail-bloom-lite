import { ownsOrder } from "@/lib/learner-access";
import { learnerSummary } from "@/lib/learner-progress";
import type { PurchaseAdmin } from "@/lib/purchase-access.server";

/** Only a validated account owning a paid same-shop purchase may record/read progress. */
export async function ownsFormation(sb: PurchaseAdmin, userId: string, productId: string, organizationId: string) {
  const { data, error } = await sb.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  const user = { id: userId, email: data.user.email ?? null, emailVerified: !!data.user.email_confirmed_at };
  const { data: orders, error: ordersError } = await sb.from("digital_orders").select("id, status, buyer_email").eq("product_id", productId).eq("organization_id", organizationId).eq("status", "paid");
  if (ordersError) throw new Error("Vérification impossible");
  if (!orders?.length) return false;
  const { data: claims, error: claimsError } = await sb.from("digital_order_claims").select("order_id, user_id").in("order_id", orders.map((o) => o.id));
  if (claimsError) throw new Error("Vérification impossible");
  const claimed = new Map((claims ?? []).map((c) => [c.order_id, c.user_id]));
  return orders.some((o) => ownsOrder({ ...o, claimedBy: claimed.get(o.id) ?? null }, user));
}

export async function readLearnerProgress(sb: PurchaseAdmin, userId: string, productId: string, organizationId: string) {
  const [lessons, history, state, modules] = await Promise.all([
    sb.from("digital_lessons").select("id, module_id, position, created_at").eq("product_id", productId).eq("organization_id", organizationId).eq("is_published", true).order("position").order("created_at"),
    sb.from("digital_learner_lessons").select("lesson_id, is_completed, first_viewed_at, last_viewed_at, completed_at").eq("user_id", userId).eq("product_id", productId).eq("organization_id", organizationId),
    sb.from("digital_learner_courses").select("last_lesson_id, first_viewed_at").eq("user_id", userId).eq("product_id", productId).eq("organization_id", organizationId).maybeSingle(),
    sb.from("digital_modules").select("id, position, created_at").eq("product_id", productId).eq("organization_id", organizationId).order("position").order("created_at"),
  ]);
  if (lessons.error || history.error || state.error || modules.error) throw new Error("Progression indisponible");
  const moduleOrder = new Map((modules.data ?? []).map((m, i) => [m.id, i]));
  const ordered = [...(lessons.data ?? [])].sort((a, b) => (moduleOrder.get(a.module_id) ?? 0) - (moduleOrder.get(b.module_id) ?? 0) || a.position - b.position || a.created_at.localeCompare(b.created_at));
  return learnerSummary(ordered.map((l) => ({ ...l, open: true })), history.data ?? [], state.data);
}

export async function writeLearnerActivity(sb: PurchaseAdmin, userId: string, product: string, lessonId: string, action: "view" | "done" | "undone") {
  const query = sb.from("digital_products").select("id, organization_id, product_type");
  const { data: p, error } = await (/^[0-9a-f-]{36}$/i.test(product) ? query.eq("id", product) : query.eq("slug", product.toLowerCase())).maybeSingle();
  if (error || !p || p.product_type !== "formation" || !await ownsFormation(sb, userId, p.id, p.organization_id)) throw new Error("Accès refusé");
  const { data: lesson, error: lessonError } = await sb.from("digital_lessons").select("id").eq("id", lessonId).eq("product_id", p.id).eq("organization_id", p.organization_id).eq("is_published", true).maybeSingle();
  if (lessonError || !lesson) throw new Error("Leçon inaccessible");
  const { error: savedError } = await sb.rpc("record_learner_activity", { _user: userId, _product: p.id, _organization: p.organization_id, _lesson: lessonId, _action: action });
  if (savedError) throw new Error("Leçon inaccessible ou enregistrement impossible");
  return readLearnerProgress(sb, userId, p.id, p.organization_id);
}