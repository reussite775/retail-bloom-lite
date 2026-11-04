import { createFileRoute } from "@tanstack/react-router";

// Scheduled safety net: if a BkaPay notification never arrives, ask BkaPay's authenticated
// status API about each recent pending checkout. Activation happens only when BkaPay itself
// reports "completed" (see reconcileCheckout). Idempotent: paid checkouts are skipped.
export const Route = createFileRoute("/api/public/bkapay/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const since = new Date(Date.now() - 2 * 86400000).toISOString();
        const { data: rows } = await supabaseAdmin.from("payment_checkouts").select("id")
          .eq("status", "pending").not("session_id", "is", null)
          .gte("created_at", since).order("created_at", { ascending: false }).limit(30);
        const { reconcileCheckout } = await import("@/lib/bkapay.server");
        const results: Record<string, number> = {};
        for (const r of rows ?? []) {
          const res = await reconcileCheckout(r.id);
          results[res] = (results[res] ?? 0) + 1;
        }
        const { data: digital } = await supabaseAdmin.from("digital_orders").select("id")
          .eq("status", "pending").not("session_id", "is", null)
          .gte("created_at", since).order("created_at", { ascending: false }).limit(30);
        const { reconcileDigitalOrder } = await import("@/lib/bkapay.server");
        for (const r of digital ?? []) {
          const res = await reconcileDigitalOrder(r.id);
          results[`digital_${res}`] = (results[`digital_${res}`] ?? 0) + 1;
        }
        return Response.json({ checked: (rows?.length ?? 0) + (digital?.length ?? 0), results });
      },
    },
  },
});
