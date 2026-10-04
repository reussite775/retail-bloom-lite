import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, Receipt, Search, TrendingUp, Wallet, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { money, startOfToday } from "@/lib/format";
import { matches } from "@/lib/stock";

export const Route = createFileRoute("/_app/ventes")({
  head: () => ({
    meta: [
      { title: "Historique des ventes — Boutik" },
      { name: "description", content: "Toutes vos ventes passées, filtrées par période, avec le bénéfice réalisé." },
      { property: "og:title", content: "Historique des ventes — Boutik" },
      { property: "og:description", content: "Toutes vos ventes passées, filtrées par période, avec le bénéfice réalisé." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Sales,
});

type Period = "today" | "week" | "month" | "all";
const periods: [Period, string][] = [["today", "Aujourd'hui"], ["week", "Cette semaine"], ["month", "Ce mois-ci"], ["all", "Tout"]];

function since(p: Period) {
  const d = startOfToday();
  if (p === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  else if (p === "month") d.setDate(1);
  else if (p === "all") return null;
  return d;
}

function Sales() {
  const [period, setPeriod] = useState<Period>("today");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["sales", "history", period],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select("*, customers(name), sale_items(product_name, quantity, unit_price, unit_cost)")
        .order("created_at", { ascending: false })
        .limit(1000);
      const s = since(period);
      if (s) query = query.gte("created_at", s.toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const list = q
    ? data.filter((s) => matches(s.customers?.name ?? "", q) || s.sale_items.some((i) => matches(i.product_name, q)))
    : data;
  const revenue = list.reduce((a, s) => a + Number(s.total), 0);
  const profit = list.reduce((a, s) => a + Number(s.profit), 0);
  const credit = list.filter((s) => s.is_credit).reduce((a, s) => a + Number(s.total), 0);
  const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  const stats = [
    { label: "Chiffre d'affaires", value: money(revenue), icon: Wallet },
    { label: "Bénéfice", value: money(profit), sub: `Marge ${marginPct} %`, icon: TrendingUp, big: true },
    { label: "Nombre de ventes", value: String(list.length), sub: credit ? `dont ${money(credit)} à crédit` : undefined, icon: Receipt },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Historique des ventes</h1>
        <p className="text-muted-foreground">Retrouvez toutes vos ventes et le bénéfice réalisé.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-sm">
          {periods.map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${period === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Produit ou client…" className="h-11 pl-9 pr-9" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button aria-label="Effacer" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-5 ${s.big ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
            <div className="flex items-center justify-between">
              <p className={`text-sm font-medium ${s.big ? "" : "text-muted-foreground"}`}>{s.label}</p>
              <s.icon className="h-5 w-5 opacity-80" />
            </div>
            <p className="mt-3 font-display text-2xl font-extrabold tabular">{s.value}</p>
            {s.sub && <p className={`mt-1 text-sm ${s.big ? "opacity-90" : "text-muted-foreground"}`}>{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="hidden grid-cols-[1.2fr_1.5fr_1fr_1fr_24px] gap-3 bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground sm:grid">
          <span>Date</span><span>Détail</span><span className="text-right">Total</span><span className="text-right">Bénéfice</span><span />
        </div>
        {isLoading && <p className="p-8 text-center text-muted-foreground">Chargement…</p>}
        {!isLoading && list.length === 0 && <p className="p-10 text-center text-muted-foreground">Aucune vente sur cette période.</p>}
        <ul className="divide-y">
          {list.map((s) => {
            const d = new Date(s.created_at);
            const isOpen = open === s.id;
            return (
              <li key={s.id}>
                <button onClick={() => setOpen(isOpen ? null : s.id)} className="grid w-full grid-cols-[1fr_auto_24px] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50 sm:grid-cols-[1.2fr_1.5fr_1fr_1fr_24px]">
                  <span>
                    <span className="font-medium">{d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                    <span className="text-muted-foreground"> · {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="block text-muted-foreground sm:hidden">{s.items_count} article(s){s.is_credit ? " · Crédit" : ""}</span>
                  </span>
                  <span className="hidden items-center gap-2 text-muted-foreground sm:flex">
                    {s.items_count} article(s)
                    {s.is_credit && <span className="rounded-full bg-warning/25 px-2 py-0.5 text-xs font-semibold text-warning-foreground">Crédit{s.customers?.name ? ` · ${s.customers.name}` : ""}</span>}
                  </span>
                  <span className="text-right font-semibold tabular">
                    {money(s.total)}
                    <span className="block text-xs font-normal text-primary sm:hidden">+{money(s.profit)}</span>
                  </span>
                  <span className="hidden text-right font-semibold text-primary tabular sm:block">{money(s.profit)}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="bg-muted/40 px-4 py-3 text-sm">
                    {s.sale_items.map((i, k) => (
                      <div key={k} className="flex justify-between py-1">
                        <span>{i.quantity} × {i.product_name}</span>
                        <span className="tabular">{money(i.quantity * Number(i.unit_price))}</span>
                      </div>
                    ))}
                    {s.is_credit && s.customers?.name && <p className="mt-2 text-muted-foreground">Vente à crédit — {s.customers.name}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
