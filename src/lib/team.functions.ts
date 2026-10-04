import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOwner(supabase: any, userId: string) {
  const { data, error } = await supabase.from("shop_members").select("role").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) throw new Error("Seul le propriétaire de la boutique peut gérer les employés.");
}

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(1, "Nom requis").max(80),
      email: z.string().trim().email("Email invalide").max(255),
      password: z.string().min(6, "Mot de passe : 6 caractères minimum").max(72),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.name },
    });
    if (error || !created.user) {
      throw new Error(error?.message?.includes("already") ? "Cette adresse email est déjà utilisée." : (error?.message ?? "Erreur"));
    }
    const { error: e2 } = await supabaseAdmin.from("shop_members").insert({
      user_id: created.user.id,
      shop_id: context.userId,
      role: "cashier",
      email: data.email,
      display_name: data.name,
    });
    if (e2) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(e2.message);
    }
    return { ok: true };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin.from("shop_members").select("shop_id").eq("user_id", data.userId).maybeSingle();
    if (!m || m.shop_id !== context.userId) throw new Error("Employé introuvable");
    await supabaseAdmin.from("shop_members").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
