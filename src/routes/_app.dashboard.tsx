import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Package, Receipt, TrendingUp, Wallet } from "lucide-react";
import { money, startOfToday } from "@/lib/format";
import { productsQuery, todaySalesQuery, weekSalesQuery } from "@/lib/data";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — Boutik" },
      { name: "description", content: "Chiffre d'affaires du jour et statistiques de votre boutique." },
      { property: "og:title", content: "Tableau de bord — Boutik" },
      { property: "og:description", content: "Chiffre d'affaires du jour et statistiques de votre boutique." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const today = useQuery(todaySalesQuery);
  const week = useQuery(weekSalesQuery);
  const products = useQuery(productsQuery);

  const sales = today.data ?? [];
  const revenue = sales.reduce((s, x) => s + Number(x.total), 0);
  const profit = sales.reduce((s, x) => s + Number(x.profit), 0);
  const prods = products.data ?? [];
  const low = prods.filter((p) => p.stock <= 5);
  const stockValue = prods.reduce((s, p) => s + p.stock * Number(p.purchase_price), 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = startOfToday();
    d.setDate(d.getDate() - (6 - i));
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const total = (week.data ?? []).filter((s) => { const t = new Date(s.created_at); return t >= d && t < next; })
      .reduce((a, s) => a + Number(s.total), 0);
    return { label: d.toLocaleDateString("fr-FR", { weekday: "short" }), total };
  });
  const max = Math.max(1, ...days.map((d) => d.total));

  const stats = [
    { label: "Chiffre d'affaires du jour", value: money(revenue), icon: Wallet, big: true },
    { label: "Bénéfice du jour", value: money(profit), icon: TrendingUp },
    { label: "Ventes du jour", value: String(sales.length), icon: Receipt },
    { label: "Valeur du stock", value: money(stockValue), icon: Package },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Tableau de bord</h1>
        <p className="text-muted-foreground first-letter:uppercase">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-5 ${s.big ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
            <div className="flex items-center justify-between">
              <p className={`text-sm font-medium ${s.big ? "" : "text-muted-foreground"}`}>{s.label}</p>
              <s.icon className="h-5 w-5 opacity-80" />
            </div>
            <p className="mt-3 font-display text-2xl font-extrabold tabular">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-6 lg:col-span-2">
          <h2 className="font-bold">Ventes des 7 derniers jours</h2>
          <div className="mt-6 flex h-48 items-end gap-3">
            {days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t-md bg-primary/85 transition-all" style={{ height: `${(d.total / max) * 100}%`, minHeight: 4 }} title={money(d.total)} />
                <span className="text-xs text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h2 className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 text-warning" /> Stock faible</h2>
          {low.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Aucun produit en rupture.</p> : (
            <ul className="mt-4 divide-y">
              {low.slice(0, 8).map((p) => (
                <li key={p.id} className="flex justify-between py-2 text-sm">
                  <span>{p.name}</span>
                  <span className={`font-semibold tabular ${p.stock === 0 ? "text-destructive" : "text-warning-foreground"}`}>{p.stock}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="rounded-xl border bg-card p-6">
        <h2 className="font-bold">Dernières ventes du jour</h2>
        {sales.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Aucune vente aujourd'hui.</p> : (
          <ul className="mt-4 divide-y">
            {sales.slice(0, 10).map((s) => (
              <li key={s.id} className="flex justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">{new Date(s.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {s.items_count} article(s)</span>
                <span className="font-semibold tabular">{money(s.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
