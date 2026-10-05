import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Item = { shop_id: string; priority: "haute" | "moyenne" | "basse"; reason: string; message: string };

export const generateFollowUps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (!ok) throw new Error("Accès refusé");
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Service IA non configuré");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [orgs, users, sales] = await Promise.all([
      supabaseAdmin.from("organizations").select("id, owner_id, name, contact, trial_ends_at, subscription_active, subscription_ends_at, created_at"),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin.from("sales").select("user_id, created_at").gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
    ]);
    if (orgs.error) throw new Error(orgs.error.message);
    const byId = new Map((users.data?.users ?? []).map((u) => [u.id, u]));
    const now = Date.now();
    const shops = (orgs.data ?? []).map((o) => {
      const u = byId.get(o.owner_id);
      const active = o.subscription_active && (!o.subscription_ends_at || new Date(o.subscription_ends_at).getTime() > now);
      const trial = new Date(o.trial_ends_at).getTime() > now;
      const due = active ? o.subscription_ends_at : o.trial_ends_at;
      return {
        shop_id: o.id,
        boutique: o.name,
        commercant: String((u?.user_metadata as Record<string, unknown> | undefined)?.["full_name"] ?? ""),
        statut: active ? "Actif" : trial ? "Essai en cours" : "Expiré",
        echeance: due ? due.slice(0, 10) : "aucune",
        jours_restants: due ? Math.round((new Date(due).getTime() - now) / 86400000) : null,
        ventes_30j: (sales.data ?? []).filter((s) => s.user_id === o.id).length,
        derniere_connexion: u?.last_sign_in_at?.slice(0, 10) ?? "jamais",
        contact: o.contact,
      };
    });
    if (shops.length === 0) return { items: [], shops: [] };

    const prompt = `Tu es le responsable commercial de GestiPro, une application de caisse et de gestion de stock pour petits commerçants (Afrique de l'Ouest, francs CFA, paiement par Mobile Money).
Aujourd'hui : ${new Date().toISOString().slice(0, 10)}.
Voici les boutiques (JSON) :
${JSON.stringify(shops)}

Pour CHAQUE boutique, attribue une priorité de relance ("haute", "moyenne" ou "basse"), une raison courte (max 20 mots), et un message personnalisé en français, chaleureux et professionnel, prêt à envoyer par WhatsApp (max 60 mots, tutoiement interdit, utilise le nom de la boutique et du commerçant s'il est connu, mentionne l'échéance et l'activité réelle). Priorité haute : essai ou abonnement qui finit dans 3 jours ou moins, ou expiré récemment avec de l'activité. Basse : abonnement actif loin de l'échéance.
Réponds UNIQUEMENT avec du JSON valide de la forme {"items":[{"shop_id":"...","priority":"haute","reason":"...","message":"..."}]}, sans texte autour.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: prompt,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      console.error("AI gateway error", res.status, body);
      if (res.status === 429) throw new Error("Trop de demandes, réessayez dans un moment.");
      if (res.status === 402) throw new Error("Crédits IA épuisés. Ajoutez des crédits dans les réglages de l'espace de travail.");
      if (res.status === 403) throw new Error("Accès au service IA refusé.");
      throw new Error("Le service IA est indisponible pour le moment.");
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "", failure = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "error" || ev.type === "response.failed") failure = ev.error?.message ?? ev.response?.error?.message ?? "Erreur IA";
        } catch { /* partial frame */ }
      }
    }
    if (failure) throw new Error("Le service IA a échoué : " + failure);
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Réponse IA vide ou illisible. Réessayez.");
    let parsed: { items?: Item[] };
    try { parsed = JSON.parse(m[0]); } catch { throw new Error("Réponse IA illisible. Réessayez."); }
    const ids = new Set(shops.map((s) => s.shop_id));
    const order = { haute: 0, moyenne: 1, basse: 2 } as const;
    const items = (parsed.items ?? [])
      .filter((x) => x && ids.has(x.shop_id))
      .map((x) => ({
        shop_id: x.shop_id,
        priority: (["haute", "moyenne", "basse"].includes(x.priority) ? x.priority : "moyenne") as Item["priority"],
        reason: String(x.reason ?? "").slice(0, 200),
        message: String(x.message ?? "").slice(0, 800),
      }))
      .sort((a, b) => order[a.priority] - order[b.priority]);
    return { items, shops };
  });
