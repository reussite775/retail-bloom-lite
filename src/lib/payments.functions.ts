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

    const apiKey = process.env["BKAPAY_SECRET_KEY"];
    if (!apiKey) return { checkoutId: c.id, paymentUrl: null as string | null, configured: false };

    const APP = "https://getcommercestream.app";
    try {
      const res = await fetch("https://bkapay.com/api/v1/payment-sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          amount, currency: "XOF",
          description: `GestiPro ${PLANS[data.plan].name} · ${months} mois`,
          success_url: `${APP}/abonnement?checkout=${c.id}`,
          cancel_url: `${APP}/abonnement?checkout=${c.id}&cancelled=1`,
          callback_url: `${APP}/api/public/bkapay/webhook`,
          order_id: c.id,
          expires_in: 3600,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, any>;
      const d = (json.data ?? json) as Record<string, any>;
      const paymentUrl: string | undefined = d.payment_url ?? d.paymentUrl;
      const sessionId: string | undefined = d.session_id ?? d.sessionId ?? d.id;
      if (!res.ok || !paymentUrl) {
        console.error("BkaPay session failed", res.status);
        await supabaseAdmin.from("payment_checkouts").update({ status: "failed" }).eq("id", c.id);
        throw new Error("Le paiement n'a pas pu démarrer. Veuillez réessayer dans un instant.");
      }
      await supabaseAdmin.from("payment_checkouts").update({ session_id: sessionId ? String(sessionId) : null }).eq("id", c.id);
      return { checkoutId: c.id, paymentUrl, configured: true };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Le paiement")) throw e;
      await supabaseAdmin.from("payment_checkouts").update({ status: "failed" }).eq("id", c.id);
      throw new Error("Le paiement n'a pas pu démarrer. Veuillez réessayer dans un instant.");
    }
  });
