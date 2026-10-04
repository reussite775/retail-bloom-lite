import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

// Bkapay payment callback. Adjust the signature header name and payload fields to Bkapay's docs.
const Payload = z.object({
  reference: z.string().uuid(), // our payment_checkouts.id, sent to Bkapay at checkout
  status: z.string(),
  transaction_id: z.string().max(200).optional(),
});

export const Route = createFileRoute("/api/public/bkapay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["BKAPAY_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const body = await request.text();
        const sig = request.headers.get("x-bkapay-signature") ?? "";
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const a = Buffer.from(sig), b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Invalid signature", { status: 401 });

        const parsed = Payload.safeParse(JSON.parse(body));
        if (!parsed.success) return new Response("Bad payload", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const ok = ["success", "successful", "paid", "completed"].includes(parsed.data.status.toLowerCase());
        if (ok) {
          const { error } = await supabaseAdmin.rpc("mark_checkout_paid", {
            _checkout: parsed.data.reference, _provider_ref: parsed.data.transaction_id ?? null as any, _event: JSON.parse(body), _method: "Bkapay",
          });
          if (error) return new Response(error.message, { status: 400 });
        } else {
          await supabaseAdmin.from("payment_checkouts").update({ status: "failed", raw_event: JSON.parse(body) })
            .eq("id", parsed.data.reference).eq("status", "pending");
        }
        return new Response("ok");
      },
    },
  },
});
