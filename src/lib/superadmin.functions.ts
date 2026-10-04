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
      loadUsers(supabaseAdmin),
      supabaseAdmin.from("organizations").select("id, owner_id, name, plan, trial_ends_at, subscription_active, subscription_ends_at, subscription_started_at, created_at"),
      supabaseAdmin.from("organization_members").select("user_id").eq("role", "cashier"),
      supabaseAdmin.from("subscription_payments").select("id, shop_id, amount, method, note, created_at").order("created_at", { ascending: false }),
    ]);
    if (profiles.error) throw new Error(profiles.error.message);
    const employees = new Set((members.data ?? []).map((m) => m.user_id));
    const byId = new Map(users.map((u) => [u.id, u]));
    const pays = payments.data ?? [];
    const merchants = (profiles.data ?? [])
      .map((p) => {
        const u = byId.get(p.owner_id);
        const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
        const mine = pays.filter((x) => x.shop_id === p.id);
        return {
          id: p.id,
          name: String(meta["full_name"] ?? meta["name"] ?? meta["display_name"] ?? ""),
          email: u?.email ?? "",
          shop_name: p.name,
          plan: p.plan,
          created_at: u?.created_at ?? p.created_at,
          trial_ends_at: p.trial_ends_at,
          subscription_active: p.subscription_active,
          subscription_ends_at: p.subscription_ends_at,
          subscription_started_at: p.subscription_started_at,
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
      plan: z.enum(["standard", "premium"]).optional(),
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
    const { data: p, error } = await supabaseAdmin.from("organizations").select("trial_ends_at, subscription_ends_at, subscription_active, subscription_started_at").eq("id", data.shopId).single();
    if (error) throw new Error("Boutique introuvable");
    const now = Date.now();
    let patch: { subscription_active?: boolean; subscription_ends_at?: string | null; subscription_started_at?: string; trial_ends_at?: string; plan?: string } = {};
    if (data.action === "activate") {
      let ends: string | null = null;
      if (data.months && data.months > 0) {
        const base = p.subscription_active && p.subscription_ends_at && new Date(p.subscription_ends_at).getTime() > now ? new Date(p.subscription_ends_at) : new Date();
        base.setMonth(base.getMonth() + data.months);
        ends = base.toISOString();
      }
      const renewing = p.subscription_active && (!p.subscription_ends_at || new Date(p.subscription_ends_at).getTime() > now);
      patch = { subscription_active: true, subscription_ends_at: ends, plan: data.plan ?? "standard", subscription_started_at: renewing && p.subscription_started_at ? p.subscription_started_at : new Date().toISOString() };
    } else if (data.action === "deactivate") {
      patch = { subscription_active: false, subscription_ends_at: null };
    } else {
      const base = Math.max(now, new Date(p.trial_ends_at).getTime());
      patch = { trial_ends_at: new Date(base + (data.days ?? 7) * 86400000).toISOString() };
    }
    const { error: e2 } = await supabaseAdmin.from("organizations").update(patch).eq("id", data.shopId);
    if (e2) throw new Error(e2.message);
    if (data.action === "activate" && data.amount && data.amount > 0) {
      const { error: e3 } = await supabaseAdmin.from("subscription_payments").insert({
        shop_id: data.shopId, amount: data.amount, method: data.method || "Mobile Money", note: `${data.plan === "premium" ? "Premium" : "Standard"}${data.note ? " · " + data.note : ""}`, recorded_by: context.userId,
      });
      if (e3) throw new Error(e3.message);
    }
    return { ok: true };
  });

export const listCheckouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("payment_checkouts")
      .select("id, organization_id, plan, billing, months, amount, status, created_at, paid_at, organizations(name)")
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Manual validation / simulation of a Bkapay payment — same activation path as the webhook. */
export const validateCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("mark_checkout_paid", { _checkout: data.id, _provider_ref: null as any, _event: { manual: true, by: context.userId }, _method: "Validation manuelle" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function loadUsers(admin: any) {
  const all: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all as { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; user_metadata?: Record<string, unknown>; banned_until?: string | null }[];
}

export const getPlatformStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, orgs, products, sales, suspended] = await Promise.all([
      loadUsers(supabaseAdmin),
      supabaseAdmin.from("organizations").select("id, trial_ends_at, subscription_active, subscription_ends_at", { count: "exact" }),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("sales").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id").eq("is_suspended", true),
    ]);
    const susp = new Set((suspended.data ?? []).map((r) => r.id));
    const now = Date.now();
    const DAY = 86400000;
    const active = users.filter((u) => !susp.has(u.id) && u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 30 * DAY).length;
    const subs = { active: 0, trial: 0, expired: 0 };
    for (const o of orgs.data ?? []) {
      if (o.subscription_active && (!o.subscription_ends_at || new Date(o.subscription_ends_at).getTime() > now)) subs.active++;
      else if (new Date(o.trial_ends_at).getTime() > now) subs.trial++;
      else subs.expired++;
    }
    const fresh = users.filter((u) => now - new Date(u.created_at).getTime() < 7 * DAY).length;
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const daily: { label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * DAY);
      const k = key(d);
      daily.push({ label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), count: users.filter((u) => u.created_at.slice(0, 10) === k).length });
    }
    const weekly: { label: string; count: number }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
    for (let i = 11; i >= 0; i--) {
      const start = monday.getTime() - i * 7 * DAY;
      weekly.push({
        label: new Date(start).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
        count: users.filter((u) => { const t = new Date(u.created_at).getTime(); return t >= start && t < start + 7 * DAY; }).length,
      });
    }
    const monthly: { label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly.push({ label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }), count: users.filter((u) => u.created_at.slice(0, 7) === ym).length });
    }
    return {
      subscribedShops: subs.active, trialShops: subs.trial, expiredShops: subs.expired,
      totalUsers: users.length, activeUsers: active, newUsers: fresh, suspendedUsers: susp.size,
      organizations: orgs.count ?? 0, products: products.count ?? 0, sales: sales.count ?? 0,
      daily, weekly, monthly,
    };
  });

export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, profiles, members, orgs] = await Promise.all([
      loadUsers(supabaseAdmin),
      supabaseAdmin.from("profiles").select("id, full_name, is_suspended, suspended_at"),
      supabaseAdmin.from("organization_members").select("user_id, organization_id, role"),
      supabaseAdmin.from("organizations").select("id, name"),
    ]);
    const prof = new Map((profiles.data ?? []).map((p) => [p.id, p]));
    const mem = new Map((members.data ?? []).map((m) => [m.user_id, m]));
    const org = new Map((orgs.data ?? []).map((o) => [o.id, o.name]));
    return users
      .map((u) => {
        const p = prof.get(u.id); const m = mem.get(u.id); const meta = u.user_metadata ?? {};
        return {
          id: u.id,
          email: u.email ?? "",
          name: p?.full_name || String(meta["full_name"] ?? meta["name"] ?? meta["display_name"] ?? ""),
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          suspended: !!p?.is_suspended,
          role: m?.role ?? null,
          shop: m ? org.get(m.organization_id) ?? "" : "",
          isSelf: u.id === context.userId,
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  });

export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), suspended: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Vous ne pouvez pas suspendre votre propre compte.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.suspended ? "876000h" : "none" });
    if (error) throw new Error(error.message);
    const { error: e2 } = await supabaseAdmin.from("profiles")
      .update({ is_suspended: data.suspended, suspended_at: data.suspended ? new Date().toISOString() : null }).eq("id", data.userId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      contact_email: z.union([z.literal(""), z.string().trim().email("Email invalide").max(255)]),
      contact_whatsapp: z.string().trim().max(30).regex(/^[+\d\s().-]*$/, "Numéro invalide"),
      payment_instructions: z.string().trim().max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("platform_settings").update({ ...data, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
