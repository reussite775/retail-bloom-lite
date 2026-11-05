import { createFileRoute } from "@tanstack/react-router";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { canOpenLesson } from "@/lib/learner-access";

export const Route = createFileRoute("/api/digital-content")({
  server: { handlers: {
    DELETE: async ({ request }) => {
      if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
      deleteCookie("gestipro_content_session", { path: "/api/digital-content" });
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    },
    GET: async ({ request }) => {
    const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
    const denied = () => new Response("Accès refusé. Connectez-vous au compte propriétaire de cet achat.", { status: 403, headers });
    const parsed = z.object({ product: z.string().uuid(), resource: z.union([z.literal("main"), z.string().uuid()]), o: z.string().uuid().optional(), t: z.string().regex(/^[a-f0-9]{16,128}$/).optional(), download: z.string().optional() }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return denied();
    const d = parsed.data;
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { authorizePurchase, purchaseIdentity, DOWNLOAD_COOKIE } = await import("@/lib/purchase-access.server");
    const cookie = getCookie(DOWNLOAD_COOKIE);
    const userId = await purchaseIdentity(sb, request.headers.get("authorization") ?? (cookie ? `Bearer ${cookie}` : ""));
    const { data: p } = await sb.from("digital_products").select("id, organization_id, status, file_path, file_name").eq("id", d.product).maybeSingle();
    if (!p) return denied();
    const order = await authorizePurchase(sb, d.o, d.t, p.id, p.organization_id, userId);
    let path: string | null = null;
    let name: string | null = null;
    if (d.resource === "main") {
      if (!order) return denied();
      path = p.file_path; name = p.file_name;
    } else {
      const { data: r } = await sb.from("digital_resources").select("file_path, file_name, lesson_id, organization_id").eq("id", d.resource).eq("product_id", p.id).maybeSingle();
      if (!r || r.organization_id !== p.organization_id) return denied();
      if (r.lesson_id) {
        const { data: lesson } = await sb.from("digital_lessons").select("is_free, is_published").eq("id", r.lesson_id).eq("product_id", p.id).maybeSingle();
        if (!lesson || !canOpenLesson(lesson, { purchased: !!order, productPublished: p.status === "published" })) return denied();
      } else if (!order) return denied();
      path = r.file_path; name = r.file_name;
    }
    if (!path?.startsWith(`${p.organization_id}/${p.id}/`)) return denied();
    // Do not expose a storage signed URL: every new request rechecks the current claim.
    const { data: signed } = await sb.storage.from("digital-files").createSignedUrl(path, 30);
    if (!signed) return denied();
    const upstream = await fetch(signed.signedUrl, { headers: request.headers.has("range") ? { Range: request.headers.get("range") ?? "" } : {} });
    if (!upstream.ok) return new Response("Fichier indisponible", { status: 404, headers });
    const responseHeaders = new Headers(headers);
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(key); if (value) responseHeaders.set(key, value);
    }
    if (d.download) responseHeaders.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name ?? "fichier")}`);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } } },
});