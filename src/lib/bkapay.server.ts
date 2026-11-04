// Server-only: confirms a BkaPay checkout by asking BkaPay's authenticated status API
// (GET /api/v1/payment-sessions/:id/status with BKAPAY_SECRET_KEY). The payment is
// activated only when BkaPay itself reports "completed" for the same order, amount and currency.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ReconcileResult = "activated" | "already_paid" | "pending" | "failed" | "expired" | "mismatch" | "error";

type Checkout = { id: string; amount: number | string; currency: string; status: string; session_id: string | null };

export async function reconcileCheckout(checkoutId: string, event: unknown = null): Promise<ReconcileResult> {
  const { data: c } = await supabaseAdmin.from("payment_checkouts")
    .select("id, amount, currency, status, session_id").eq("id", checkoutId).maybeSingle<Checkout>();
  if (!c) return "error";
  if (c.status === "paid") return "already_paid";
  if (!c.session_id) return "pending";
  const apiKey = process.env["BKAPAY_SECRET_KEY"];
  if (!apiKey) return "error";

  const res = await fetch(`https://bkapay.com/api/v1/payment-sessions/${encodeURIComponent(c.session_id)}/status`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  }).catch(() => null);
  if (!res) return "error";
  const s = (await res.json().catch(() => ({}))) as any;
  const status = String(s.status ?? "").toLowerCase();

  if (status === "completed") {
    const orderId = String(s.orderId ?? s.order_id ?? "");
    const amount = Number(s.amount);
    const currency = String(s.currency ?? "").toUpperCase();
    const okCurrency = currency === c.currency || (c.currency === "XOF" && ["FCFA", "CFA", "XOF"].includes(currency));
    if (orderId !== c.id || amount !== Number(c.amount) || !okCurrency) {
      console.error("bkapay reconcile: mismatch", { checkout: c.id, orderId, amount, currency });
      return "mismatch";
    }
    const tx = s.transactionId ?? s.transaction_id;
    if (tx) {
      const { data: dup } = await supabaseAdmin.from("payment_checkouts").select("id")
        .eq("transaction_id", String(tx)).neq("id", c.id).maybeSingle();
      if (dup) return "mismatch";
      await supabaseAdmin.from("payment_checkouts").update({ transaction_id: String(tx) }).eq("id", c.id);
    }
    const { error } = await supabaseAdmin.rpc("mark_checkout_paid", {
      _checkout: c.id, _provider_ref: tx ? String(tx) : (null as any),
      _event: (event ?? { source: "bkapay_status_api", ...s }) as any, _method: "BkaPay",
    });
    if (error) { console.error("bkapay reconcile: activation failed", error.message); return "error"; }
    return "activated";
  }
  if ((status === "failed" || status === "expired") && c.status === "pending") {
    await supabaseAdmin.from("payment_checkouts").update({ status }).eq("id", c.id).eq("status", "pending");
    return status;
  }
  return status === "failed" || status === "expired" ? status : "pending";
}

type DigitalOrder = { id: string; amount: number | string; currency: string; status: string; session_id: string | null };

/**
 * Same rule for digital-product purchases: an order becomes "paid" only when BkaPay's
 * authenticated status API reports "completed" for this order id, amount and currency.
 * The conditional update (status = 'pending') makes it idempotent.
 */
export async function reconcileDigitalOrder(orderId: string): Promise<ReconcileResult> {
  const { data: o } = await supabaseAdmin.from("digital_orders")
    .select("id, amount, currency, status, session_id").eq("id", orderId).maybeSingle<DigitalOrder>();
  if (!o) return "error";
  if (o.status === "paid") return "already_paid";
  if (!o.session_id) return "pending";
  const apiKey = process.env["BKAPAY_SECRET_KEY"];
  if (!apiKey) return "error";
  const res = await fetch(`https://bkapay.com/api/v1/payment-sessions/${encodeURIComponent(o.session_id)}/status`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  }).catch(() => null);
  if (!res) return "error";
  const s = (await res.json().catch(() => ({}))) as any;
  const status = String(s.status ?? "").toLowerCase();

  if (status === "completed") {
    const orderRef = String(s.orderId ?? s.order_id ?? "");
    const amount = Number(s.amount);
    const currency = String(s.currency ?? "").toUpperCase();
    const okCurrency = currency === o.currency || (o.currency === "XOF" && ["FCFA", "CFA", "XOF"].includes(currency));
    if (orderRef !== o.id || amount !== Number(o.amount) || !okCurrency) {
      console.error("bkapay digital: mismatch", { order: o.id, orderRef, amount, currency });
      return "mismatch";
    }
    const tx = s.transactionId ?? s.transaction_id;
    if (tx) {
      const { data: dup } = await supabaseAdmin.from("digital_orders").select("id")
        .eq("transaction_id", String(tx)).neq("id", o.id).maybeSingle();
      if (dup) return "mismatch";
    }
    const { data: updated, error } = await supabaseAdmin.from("digital_orders")
      .update({ status: "paid", paid_at: new Date().toISOString(), transaction_id: tx ? String(tx) : null, raw_event: { source: "bkapay_status_api", ...s } })
      .eq("id", o.id).eq("status", "pending").select("id");
    if (error) { console.error("bkapay digital: update failed", error.message); return "error"; }
    return updated && updated.length > 0 ? "activated" : "already_paid";
  }
  if ((status === "failed" || status === "expired") && o.status === "pending") {
    await supabaseAdmin.from("digital_orders").update({ status }).eq("id", o.id).eq("status", "pending");
    return status;
  }
  return status === "failed" || status === "expired" ? status : "pending";
}

/** Finds a digital order referenced by a BkaPay notification (order id or session id). */
export async function findDigitalOrderId(order: string, session: unknown): Promise<string | null> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID.test(order)) {
    const { data } = await supabaseAdmin.from("digital_orders").select("id").eq("id", order).maybeSingle();
    if (data) return data.id;
  }
  if (session) {
    const { data } = await supabaseAdmin.from("digital_orders").select("id").eq("session_id", String(session)).maybeSingle();
    if (data) return data.id;
  }
  return null;
}
