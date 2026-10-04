import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BILLING_MONTHS, PLANS } from "@/lib/plans";

/**
 * Starts a Bkapay checkout for the caller's shop.
 * Price is always computed server-side from PLANS (never trusted from the client).
 * When BKAPAY_API_KEY is configured, plug the Bkapay "create payment" call in the marked block
 * and return its hosted payment URL; Bkapay then calls /api/public/bkapay/webhook.
 */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ plan: z.enum(["standard", "premium"]), billing: z.enum(["month", "quarter"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_shop_admin");
    if (!isAdmin) throw new Error("Seul le propriétaire peut souscrire un abonnement");
    const { data: orgId } = await context.supabase.rpc("current_shop");
    if (!orgId) throw new Error("Boutique introuvable");
    const amount = PLANS[data.plan].prices[data.billing];
    const months = BILLING_MONTHS[data.billing];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c, error } = await supabaseAdmin.from("payment_checkouts")
      .insert({ organization_id: orgId as string, created_by: context.userId, plan: data.plan, billing: data.billing, months, amount })
      .select("id").single();
    if (error) throw new Error(error.message);

    const apiKey = process.env["BKAPAY_API_KEY"];
    if (!apiKey) return { checkoutId: c.id, paymentUrl: null as string | null, configured: false };

    // ===== BKAPAY: create payment here =====
    // const res = await fetch("https://<bkapay-api>/payments", {
    //   method: "POST",
    //   headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({ amount, currency: "XOF", reference: c.id,
    //     callback_url: `${origin}/api/public/bkapay/webhook`, return_url: `${origin}/abonnement?checkout=${c.id}` }),
    // });
    // const json = await res.json();
    // await supabaseAdmin.from("payment_checkouts").update({ provider_ref: json.id }).eq("id", c.id);
    // return { checkoutId: c.id, paymentUrl: json.payment_url, configured: true };
    return { checkoutId: c.id, paymentUrl: null as string | null, configured: false };
  });
