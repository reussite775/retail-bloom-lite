import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// BkaPay webhook: payment.completed / payment.failed / payment.expired.
// Signature = HMAC-SHA256(raw body, BKAPAY_WEBHOOK_SECRET), sent in X-BKApay-Signature.
function validSignature(body: string, timestamp: string, sig: string, secret: string) {
  const clean = sig.replace(/^sha256=/i, "").trim();
  const candidates = [body, timestamp ? `${timestamp}.${body}` : null].filter(Boolean) as string[];
  return candidates.some((payload) => {
    const mac = createHmac("sha256", secret).update(payload);
    const hex = mac.digest("hex");
    const b64 = createHmac("sha256", secret).update(payload).digest("base64");
    return [hex, b64].some((exp) => {
      const a = Buffer.from(clean), b = Buffer.from(exp);
      return a.length === b.length && timingSafeEqual(a, b);
    });
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/bkapay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["BKAPAY_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const body = await request.text();
        const sig = request.headers.get("x-bkapay-signature") ?? "";
        const ts = request.headers.get("x-bkapay-timestamp") ?? "";
        if (!sig || !validSignature(body, ts, sig, secret)) return new Response("Invalid signature", { status: 401 });

        let payload: Record<string, any>;
        try { payload = JSON.parse(body); } catch { return new Response("Bad payload", { status: 400 }); }
        const d = (payload.data ?? payload) as Record<string, any>;
        const event = String(request.headers.get("x-bkapay-event") ?? payload.event ?? payload.type ?? "").toLowerCase();
        const orderId = String(d.order_id ?? d.orderId ?? "");
        const transactionId = d.transactionId ?? d.transaction_id ?? null;
        const sessionId = d.session_id ?? d.sessionId ?? null;
        if (!UUID.test(orderId)) return new Response("Unknown order", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: c } = await supabaseAdmin.from("payment_checkouts").select("id, amount, currency, status, session_id").eq("id", orderId).maybeSingle();
        if (!c) return new Response("Unknown order", { status: 404 });
        if (c.session_id && sessionId && String(sessionId) !== c.session_id) return new Response("Session mismatch", { status: 400 });

        if (event === "payment.completed") {
          if (c.status === "paid") return new Response("ok"); // idempotent
          if (c.status !== "pending") return new Response("Payment not pending", { status: 409 });
          const amount = Number(d.amount);
          const currency = String(d.currency ?? "").toUpperCase();
          if (amount !== Number(c.amount) || (currency && currency !== c.currency)) {
            return new Response("Amount mismatch", { status: 400 });
          }
          if (transactionId) {
            const { data: dup } = await supabaseAdmin.from("payment_checkouts").select("id").eq("transaction_id", String(transactionId)).neq("id", c.id).maybeSingle();
            if (dup) return new Response("ok");
            await supabaseAdmin.from("payment_checkouts").update({ transaction_id: String(transactionId) }).eq("id", c.id);
          }
          const { error } = await supabaseAdmin.rpc("mark_checkout_paid", {
            _checkout: c.id, _provider_ref: transactionId ? String(transactionId) : (null as any), _event: payload, _method: "BkaPay",
          });
          if (error) return new Response("Activation failed", { status: 500 });
          return new Response("ok");
        }
        if (event === "payment.failed" || event === "payment.expired") {
          await supabaseAdmin.from("payment_checkouts")
            .update({ status: event === "payment.failed" ? "failed" : "expired", raw_event: payload })
            .eq("id", c.id).eq("status", "pending");
        }
        return new Response("ok");
      },
    },
  },
});
