// TEMPORARY — BkaPay end-to-end test (Standard 14 jours, 500 FCFA). Super admin only. Delete after the test.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TEST_AMOUNT = 500;
const TEST_DAYS = 14;

export const isTestPaymentAllowed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    return { allowed: !!data };
  });

export const startTestCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Option réservée");
    const { data: isAdmin } = await context.supabase.rpc("is_shop_admin");
    const { data: orgId } = await context.supabase.rpc("current_shop");
    if (!isAdmin || !orgId) throw new Error("Boutique introuvable");
    const apiKey = process.env["BKAPAY_SECRET_KEY"];
    if (!apiKey) throw new Error("BkaPay non configuré");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c, error } = await supabaseAdmin.from("payment_checkouts")
      .insert({ organization_id: orgId as string, created_by: context.userId, plan: "standard", billing: "test14", months: 0, duration_days: TEST_DAYS, amount: TEST_AMOUNT })
      .select("id").single();
    if (error) throw new Error(error.message);
    const APP = "https://getcommercestream.app";
    const res = await fetch("https://bkapay.com/api/v1/payment-sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        amount: TEST_AMOUNT, currency: "XOF",
        description: `GestiPro Standard · ${TEST_DAYS} jours (test)`,
        success_url: `${APP}/abonnement?checkout=${c.id}`,
        cancel_url: `${APP}/abonnement?checkout=${c.id}&cancelled=1`,
        callback_url: `${APP}/api/public/bkapay/webhook`,
        order_id: c.id, expires_in: 3600,
      }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as any) : {};
    const d = (json.data ?? json) as any;
    const paymentUrl: string | undefined = d.payment_url ?? d.paymentUrl;
    const sessionId = d.session_id ?? d.sessionId ?? d.id;
    if (!res?.ok || !paymentUrl) {
      await supabaseAdmin.from("payment_checkouts").update({ status: "failed" }).eq("id", c.id);
      throw new Error("Le paiement test n'a pas pu démarrer.");
    }
    await supabaseAdmin.from("payment_checkouts").update({ session_id: sessionId ? String(sessionId) : null }).eq("id", c.id);
    return { checkoutId: c.id, paymentUrl };
  });
