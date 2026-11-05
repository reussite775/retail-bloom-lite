import { deleteCookie, getRequestHeader, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { orderUnlocks } from "@/lib/learner-access";

export type PurchaseAdmin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
export const DOWNLOAD_COOKIE = "gestipro_content_session";

/** Validate identity on every request; never trust a client-supplied user ID. */
export async function purchaseIdentity(sb: PurchaseAdmin, bearer?: string) {
  const authorization = bearer ?? getRequestHeader("authorization");
  setResponseHeader("Cache-Control", "private, no-store");
  if (!authorization?.startsWith("Bearer ")) {
    if (!bearer) deleteCookie(DOWNLOAD_COOKIE, { path: "/api/digital-content" });
    return null;
  }
  const jwt = authorization.slice(7);
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data.user) {
    if (!bearer) deleteCookie(DOWNLOAD_COOKIE, { path: "/api/digital-content" });
    return null;
  }
  if (!bearer) setCookie(DOWNLOAD_COOKIE, jwt, {
    httpOnly: true, secure: getRequestHeader("host") !== "localhost:8080", sameSite: "strict",
    path: "/api/digital-content", maxAge: 3600,
  });
  return data.user.id;
}

export async function authorizePurchase(sb: PurchaseAdmin, orderId: string | undefined, token: string | undefined, productId: string, organizationId: string, userId: string | null) {
  if (!orderId) return null;
  const { data: order, error } = await sb.from("digital_orders")
    .select("id, access_token, status, product_id, organization_id, buyer_name").eq("id", orderId).maybeSingle();
  const { data: claim, error: claimError } = await sb.from("digital_order_claims").select("user_id").eq("order_id", orderId).maybeSingle();
  if (error || claimError || order?.organization_id !== organizationId) return null;
  return orderUnlocks(order, token, productId, claim?.user_id ?? null, userId) ? order : null;
}