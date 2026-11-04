import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP = "https://getcommercestream.app";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public: starts a BkaPay payment for a PUBLISHED digital product.
 * The price is read from the database (never from the browser). The order becomes "paid"
 * only after BkaPay's official confirmation (webhook → status API, or tracking-page check).
 */
export const startDigitalOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    product: z.string().regex(/^[a-z0-9-]{1,64}$/i),
    name: z.string().trim().min(2, "Nom trop court").max(80),
    phone: z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, "Numéro de téléphone invalide"),
    email: z.union([z.literal(""), z.string().trim().email("Adresse e-mail invalide").max(120)]),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("digital_products").select("id, organization_id, title, price, product_type, status").eq("status", "published");
    q = UUID.test(data.product) ? q.eq("id", data.product) : q.eq("slug", data.product.toLowerCase());
    const { data: p } = await q.maybeSingle();
    if (!p) throw new Error("Ce produit n'est pas disponible à l'achat.");
    const amount = Math.round(Number(p.price));
    if (!(amount > 0)) throw new Error("Ce produit n'a pas de prix valide.");

    const { data: o, error } = await supabaseAdmin.from("digital_orders").insert({
      organization_id: p.organization_id, product_id: p.id, product_title: p.title, product_type: p.product_type,
      amount, buyer_name: data.name, buyer_phone: data.phone, buyer_email: data.email,
    }).select("id, access_token").single();
    if (error || !o) throw new Error("La commande n'a pas pu être créée.");

    const apiKey = process.env["BKAPAY_SECRET_KEY"];
    const fail = async () => {
      await supabaseAdmin.from("digital_orders").update({ status: "failed" }).eq("id", o.id);
      throw new Error("Le paiement n'a pas pu démarrer. Veuillez réessayer dans un instant.");
    };
    if (!apiKey) return fail();
    const track = `${APP}/commande/${o.id}?t=${o.access_token}`;
    const res = await fetch("https://bkapay.com/api/v1/payment-sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        amount, currency: "XOF",
        description: p.title.slice(0, 120),
        success_url: track,
        cancel_url: `${track}&cancelled=1`,
        callback_url: `${APP}/api/public/bkapay/webhook`,
        order_id: o.id,
        expires_in: 60,
      }),
    }).catch(() => null);
    if (!res) return fail();
    const json = (await res.json().catch(() => ({}))) as any;
    const d = (json.data ?? json) as any;
    const paymentUrl: string | undefined = d.payment_url ?? d.paymentUrl;
    const sessionId: string | undefined = d.session_id ?? d.sessionId ?? d.id;
    if (!res.ok || !paymentUrl) { console.error("BkaPay digital session failed", res.status); return fail(); }
    await supabaseAdmin.from("digital_orders").update({ session_id: sessionId ? String(sessionId) : null }).eq("id", o.id);
    return { orderId: o.id, token: o.access_token, paymentUrl };
  });

/**
 * Public tracking page data. Requires the secret token given to the buyer.
 * While pending, asks BkaPay's official status API. The file link is signed only once paid.
 */
export const getDigitalOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().regex(UUID), token: z.string().regex(/^[a-f0-9]{16,128}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const load = () => supabaseAdmin.from("digital_orders")
      .select("id, access_token, status, amount, product_id, product_title, product_type, buyer_name, created_at, paid_at, organization_id, session_id")
      .eq("id", data.id).maybeSingle();
    let { data: o } = await load();
    if (!o || o.access_token !== data.token) return null;
    if (o.status === "pending" && o.session_id) {
      const { reconcileDigitalOrder } = await import("@/lib/bkapay.server");
      const r = await reconcileDigitalOrder(o.id);
      if (r !== "pending" && r !== "error") o = (await load()).data ?? o;
    }
    const { data: org } = await supabaseAdmin.from("organizations").select("name, contact").eq("id", o.organization_id).maybeSingle();
    let downloadUrl: string | null = null;
    let fileName: string | null = null;
    if (o.status === "paid" && o.product_id) {
      const { data: prod } = await supabaseAdmin.from("digital_products").select("file_path, file_name").eq("id", o.product_id).maybeSingle();
      if (prod?.file_path) {
        const { data: s } = await supabaseAdmin.storage.from("digital-files").createSignedUrl(prod.file_path, 3600, { download: prod.file_name ?? true });
        downloadUrl = s?.signedUrl ?? null;
        fileName = prod.file_name;
      }
    }
    return {
      id: o.id, status: o.status as "pending" | "paid" | "failed" | "expired", amount: Number(o.amount),
      productTitle: o.product_title, productType: o.product_type, buyerName: o.buyer_name,
      createdAt: o.created_at, paidAt: o.paid_at, shopName: org?.name ?? "",
      shopContact: o.status === "paid" ? (org?.contact ?? "") : "",
      downloadUrl, fileName,
    };
  });

/** Super Admin: every digital-product payment across the platform. */
export const listAllDigitalOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (!ok) throw new Error("Accès refusé");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.from("digital_orders")
      .select("id, organization_id, product_title, product_type, amount, buyer_name, buyer_phone, buyer_email, status, transaction_id, created_at, paid_at")
      .order("created_at", { ascending: false }).limit(300);
    if (error) throw new Error(error.message);
    const ids = [...new Set((rows ?? []).map((r) => r.organization_id))];
    const { data: orgs } = ids.length ? await supabaseAdmin.from("organizations").select("id, name").in("id", ids) : { data: [] };
    const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
    const orders = (rows ?? []).map((r) => ({ ...r, amount: Number(r.amount), shop_name: names.get(r.organization_id) ?? "" }));
    const paid = orders.filter((o) => o.status === "paid");
    return { orders, paidCount: paid.length, revenue: paid.reduce((a, o) => a + o.amount, 0), pendingCount: orders.filter((o) => o.status === "pending").length };
  });