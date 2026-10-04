import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { hasPremium } from "@/lib/plans";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai/run-id.server";

const Body = z.object({ messages: z.array(z.any()).min(1).max(200) });
const json = (msg: string, status: number) => Response.json({ error: msg }, { status });

async function buildContext(sb: ReturnType<typeof createClient<Database>>, orgId: string) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const [org, products, sales, items, expenses, customers, payments] = await Promise.all([
    sb.from("organizations").select("name").eq("id", orgId).single(),
    sb.from("products").select("name, purchase_price, sale_price, stock, low_stock_threshold").limit(500),
    sb.from("sales").select("created_at, total, profit, items_count, is_credit").gte("created_at", since).limit(5000),
    sb.from("sale_items").select("product_name, quantity, unit_price, unit_cost, sales!inner(created_at)").gte("sales.created_at", since).limit(10000),
    sb.from("expenses").select("label, category, amount, spent_on").gte("spent_on", since.slice(0, 10)).limit(2000),
    sb.from("customers").select("id, name"),
    sb.from("credit_payments").select("customer_id, amount"),
  ]);

  // Daily totals
  const daily: Record<string, { ca: number; benef: number; n: number; credit: number }> = {};
  for (const s of sales.data ?? []) {
    const d = s.created_at.slice(0, 10);
    const r = (daily[d] ??= { ca: 0, benef: 0, n: 0, credit: 0 });
    r.ca += Number(s.total); r.benef += Number(s.profit); r.n++; if (s.is_credit) r.credit += Number(s.total);
  }
  // Product performance
  const perf: Record<string, { qte: number; ca: number; benef: number }> = {};
  for (const i of items.data ?? []) {
    const r = (perf[i.product_name] ??= { qte: 0, ca: 0, benef: 0 });
    r.qte += i.quantity; r.ca += i.quantity * Number(i.unit_price); r.benef += i.quantity * (Number(i.unit_price) - Number(i.unit_cost));
  }
  // Debts
  const paid: Record<string, number> = {};
  for (const p of payments.data ?? []) paid[p.customer_id] = (paid[p.customer_id] ?? 0) + Number(p.amount);
  const { data: creditSales } = await sb.from("sales").select("customer_id, total").eq("is_credit", true).limit(5000);
  const owed: Record<string, number> = {};
  for (const s of creditSales ?? []) if (s.customer_id) owed[s.customer_id] = (owed[s.customer_id] ?? 0) + Number(s.total);
  const debts = (customers.data ?? []).map((c) => ({ client: c.name, dette: (owed[c.id] ?? 0) - (paid[c.id] ?? 0) })).filter((d) => d.dette > 0);

  return JSON.stringify({
    boutique: org.data?.name,
    aujourdhui: new Date().toISOString().slice(0, 10),
    periode_analysee: "90 derniers jours",
    ventes_par_jour: daily,
    performance_produits: perf,
    stock: products.data,
    depenses: expenses.data,
    dettes_clients: debts,
  });
}

export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return json("Non authentifié", 401);
        const url = process.env["SUPABASE_URL"]!;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const sb = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return json("Non authentifié", 401);
        const [{ data: orgId }, { data: isAdmin }] = await Promise.all([sb.rpc("current_shop"), sb.rpc("is_shop_admin")]);
        if (!orgId || !isAdmin) return json("Réservé au propriétaire de la boutique", 403);
        const { data: org } = await sb.from("organizations").select("plan, trial_ends_at, subscription_active, subscription_ends_at").eq("id", orgId).single();
        if (!hasPremium(org)) return json("L'assistant est réservé à l'offre Premium", 403);

        const parsed = Body.safeParse(await request.json());
        if (!parsed.success) return json("Requête invalide", 400);
        const messages = parsed.data.messages as UIMessage[];
        const last = messages[messages.length - 1];
        if (last?.role === "user") {
          const { error } = await sb.from("assistant_messages").upsert(
            { user_id: u.user.id, organization_id: orgId as string, message_id: last.id, role: "user", message: last as any },
            { onConflict: "user_id,message_id", ignoreDuplicates: true },
          );
          if (error) console.error("assistant save user msg", error.message);
        }

        const context = await buildContext(sb, orgId as string);
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return json("Assistant non configuré", 500);
        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });
        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          system: `Tu es « Conseiller Boutik », l'assistant commercial d'un petit commerce de détail en Afrique de l'Ouest. Réponds toujours en français simple, concis et concret, montants en FCFA (format 12 500 FCFA). Appuie-toi UNIQUEMENT sur les données JSON ci-dessous ; si une information manque, dis-le. Quand c'est utile, termine par 2 à 4 recommandations actionnables (réapprovisionnement, prix, produits peu rentables, dépenses à réduire, relance des dettes). Utilise du markdown léger (listes, gras, petits tableaux).\n\nDONNÉES DE LA BOUTIQUE :\n${context}`,
          messages: await convertToModelMessages(messages),
          abortSignal: request.signal,
          providerOptions: {
            openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
          },
        });
        return withLovableAiGatewayRunIdHeader(
          result.toUIMessageStreamResponse({
            originalMessages: messages,
            sendReasoning: true,
            onFinish: async ({ responseMessage }) => {
              const { error } = await sb.from("assistant_messages").upsert(
                { user_id: u.user!.id, organization_id: orgId as string, message_id: responseMessage.id, role: "assistant", message: responseMessage as any },
                { onConflict: "user_id,message_id" },
              );
              if (error) console.error("assistant save reply", error.message);
            },
            onError: (e: any) => {
              const status = e?.statusCode ?? e?.status;
              if (status === 402) return "Crédits IA épuisés. Réessayez plus tard.";
              if (status === 429) return "Trop de demandes, patientez un instant puis réessayez.";
              return "L'assistant n'a pas pu répondre. Réessayez.";
            },
          }),
          runIdFetch,
        );
      },
    },
  },
});
