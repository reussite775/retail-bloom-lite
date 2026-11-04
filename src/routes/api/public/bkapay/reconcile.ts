import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Scheduled safety net: if a BkaPay notification never arrives, ask BkaPay's authenticated
// status API about each recent pending checkout. Activation happens only when BkaPay itself
// reports "completed" (see reconcileCheckout). Idempotent: paid checkouts are skipped.
export const Route = createFileRoute("/api/public/bkapay/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Only the managed scheduler may call this: its bearer secret is compared in constant time
        // server-side (missing, malformed or wrong secret → 401; secret never logged or returned).
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const since = new Date(Date.now() - 2 * 86400000).toISOString();
        // The scheduler waits only a few seconds: load and check every pending payment in parallel
        // so one run costs about one BkaPay round-trip. Each check stays idempotent.
        const [{ data: rows }, { data: digital }, { reconcileCheckout, reconcileDigitalOrder }] = await Promise.all([
          supabaseAdmin.from("payment_checkouts").select("id")
            .eq("status", "pending").not("session_id", "is", null)
            .gte("created_at", since).order("created_at", { ascending: false }).limit(30),
          supabaseAdmin.from("digital_orders").select("id")
            .eq("status", "pending").not("session_id", "is", null)
            .gte("created_at", since).order("created_at", { ascending: false }).limit(30),
          import("@/lib/bkapay.server"),
        ]);
        const outcomes = await Promise.all([
          ...(rows ?? []).map((r) => reconcileCheckout(r.id).catch(() => "error" as const)),
          ...(digital ?? []).map((r) => reconcileDigitalOrder(r.id).then((res) => `digital_${res}`).catch(() => "digital_error")),
        ]);
        const results: Record<string, number> = {};
        for (const res of outcomes) results[res] = (results[res] ?? 0) + 1;
        return Response.json({ checked: (rows?.length ?? 0) + (digital?.length ?? 0), results });
      },
    },
  },
});
