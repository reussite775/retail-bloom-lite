import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Public sale page: returns only safe columns of a PUBLISHED product. The digital file is never exposed here.
export const getPublicDigitalProduct = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input?.id ?? "")) throw new Error("Produit introuvable");
    return input;
  })
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: p } = await sb
      .from("digital_products")
      .select("id, organization_id, title, description, price, cover_path, status")
      .eq("id", data.id)
      .eq("status", "published")
      .maybeSingle();
    if (!p) return null;
    let coverUrl: string | null = null;
    if (p.cover_path) {
      // Cover bucket is private; sign only the cover of a product already verified as published.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: s } = await supabaseAdmin.storage.from("digital-covers").createSignedUrl(p.cover_path, 3600);
      coverUrl = s?.signedUrl ?? null;
    }
    const { data: shop } = await sb.from("organizations").select("name").eq("id", p.organization_id).maybeSingle();
    return { id: p.id, title: p.title, description: p.description, price: Number(p.price), coverUrl, shopName: shop?.name ?? "" };
  });
