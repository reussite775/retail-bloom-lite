import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error || !data) throw new Error("Accès refusé");
}

export const checkSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    return { isSuperAdmin: !!data };
  });

export const listMerchants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, profiles, members, payments] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin.from("profiles").select("id, shop_name, trial_ends_at, subscription_active, subscription_ends_at, created_at"),
      supabaseAdmin.from("shop_members").select("user_id"),
      supabaseAdmin.from("subscription_payments").select("id, shop_id, amount, method, note, created_at").order("created_at", { ascending: false }),
    ]);
    if (users.error) throw new Error(users.error.message);
    if (profiles.error) throw new Error(profiles.error.message);
    const employees = new Set((members.data ?? []).map((m) => m.user_id));
    const byId = new Map(users.data.users.map((u) => [u.id, u]));
    const pays = payments.data ?? [];
    const merchants = (profiles.data ?? [])
      .filter((p) => !employees.has(p.id))
      .map((p) => {
        const u = byId.get(p.id);
        const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
        const mine = pays.filter((x) => x.shop_id === p.id);
        return {
          id: p.id,
          name: String(meta["full_name"] ?? meta["name"] ?? meta["display_name"] ?? ""),
          email: u?.email ?? "",
          shop_name: p.shop_name,
          created_at: u?.created_at ?? p.created_at,
          trial_ends_at: p.trial_ends_at,
          subscription_active: p.subscription_active,
          subscription_ends_at: p.subscription_ends_at,
          paid_total: mine.reduce((a, x) => a + Number(x.amount), 0),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      merchants,
      employeesCount: employees.size,
      revenue: pays.reduce((a, x) => a + Number(x.amount), 0),
      payments: pays.slice(0, 50),
    };
  });

export const updateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      shopId: z.string().uuid(),
      action: z.enum(["activate", "deactivate", "extend_trial"]),
      months: z.number().int().min(0).max(36).optional(),
      days: z.number().int().min(1).max(365).optional(),
      amount: z.number().min(0).max(100_000_000).optional(),
      method: z.string().max(50).optional(),
      note: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p, error } = await supabaseAdmin.from("profiles").select("trial_ends_at, subscription_ends_at, subscription_active").eq("id", data.shopId).single();
    if (error) throw new Error("Boutique introuvable");
    const now = Date.now();
    let patch: Record<string, unknown> = {};
    if (data.action === "activate") {
      let ends: string | null = null;
      if (data.months && data.months > 0) {
        const base = p.subscription_active && p.subscription_ends_at && new Date(p.subscription_ends_at).getTime() > now ? new Date(p.subscription_ends_at) : new Date();
        base.setMonth(base.getMonth() + data.months);
        ends = base.toISOString();
      }
      patch = { subscription_active: true, subscription_ends_at: ends };
    } else if (data.action === "deactivate") {
      patch = { subscription_active: false, subscription_ends_at: null };
    } else {
      const base = Math.max(now, new Date(p.trial_ends_at).getTime());
      patch = { trial_ends_at: new Date(base + (data.days ?? 7) * 86400000).toISOString() };
    }
    const { error: e2 } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.shopId);
    if (e2) throw new Error(e2.message);
    if (data.action === "activate" && data.amount && data.amount > 0) {
      const { error: e3 } = await supabaseAdmin.from("subscription_payments").insert({
        shop_id: data.shopId, amount: data.amount, method: data.method || "Mobile Money", note: data.note ?? "", recorded_by: context.userId,
      });
      if (e3) throw new Error(e3.message);
    }
    return { ok: true };
  });
