import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizePageConfig } from "@/lib/page-config";

// Public sale page: returns only safe columns of a PUBLISHED product. The digital file is never exposed here.
export const getPublicDigitalProduct = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => {
    if (!/^[a-z0-9-]{1,64}$/i.test(input?.id ?? "")) throw new Error("Produit introuvable");
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
    const { data: rows, error } = await sb.rpc("public_digital_product_v3", { _identifier: data.id });
    if (error) throw new Error("Impossible de charger le produit.");
    const p = rows?.[0];
    if (!p) return null;
    let coverUrl: string | null = null;
    if (p.cover_path) {
      // Cover bucket is private; sign only the cover of a product already verified as published.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: s } = await supabaseAdmin.storage.from("digital-covers").createSignedUrl(p.cover_path, 3600);
      coverUrl = s?.signedUrl ?? null;
    }
    return { id: p.id, slug: p.slug, title: p.title, description: p.description, price: Number(p.price), coverUrl, shopName: p.shop_name, product_type: p.product_type ?? "file", pageConfig: normalizePageConfig(p.page_config) };
  });

export const getPublicCreatorStore = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => { if (!/^[a-z0-9-]{3,64}$/.test(data.slug)) throw new Error("Boutique introuvable"); return data; })
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      } },
    });
    const { data: result, error } = await sb.rpc("public_creator_store", { _slug: data.slug });
    if (error) throw new Error("Impossible de charger la boutique.");
    if (!result) return null;
    const store = result as unknown as { name: string; slug: string; products: { id: string; slug: string; title: string; description: string; price: number; cover_path: string | null }[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const products = await Promise.all(store.products.map(async (p) => {
      let coverUrl: string | null = null;
      if (p.cover_path) {
        const { data: signed } = await supabaseAdmin.storage.from("digital-covers").createSignedUrl(p.cover_path, 3600);
        coverUrl = signed?.signedUrl ?? null;
      }
      return { id: p.id, slug: p.slug, title: p.title, description: p.description, price: Number(p.price), coverUrl };
    }));
    return { name: store.name, slug: store.slug, products };
  });
