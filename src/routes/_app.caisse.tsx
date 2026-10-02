import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Minus, Plus, Search, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { productsQuery, todaySalesQuery } from "@/lib/data";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_app/caisse")({
  head: () => ({
    meta: [
      { title: "Caisse — Boutik" },
      { name: "description", content: "Enregistrez les ventes du jour rapidement." },
      { property: "og:title", content: "Caisse — Boutik" },
      { property: "og:description", content: "Enregistrez les ventes du jour rapidement." },
    ],
  }),
  component: Caisse,
});

function Caisse() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery(productsQuery);
  const { data: today = [] } = useQuery(todaySalesQuery);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});

  const byId: Record<string, (typeof products)[number]> = Object.fromEntries(products.map((p) => [p.id, p]));
  const lines = Object.entries(cart).filter(([id]) => byId[id]).map(([id, qty]) => ({ p: byId[id]!, qty }));
  const total = lines.reduce((s, l) => s + l.qty * Number(l.p.sale_price), 0);
  const todayTotal = today.reduce((s, x) => s + Number(x.total), 0);

  const add = (id: string, delta: number) => {
    setCart((c) => {
      const p = byId[id];
      if (!p) return c;
      const next = Math.min(p.stock, (c[id] ?? 0) + delta);
      const copy = { ...c };
      if (next <= 0) delete copy[id]; else copy[id] = next;
      if ((c[id] ?? 0) + delta > p.stock) toast.warning(`Stock disponible : ${p.stock}`);
      return copy;
    });
  };

  const checkout = useMutation({
    mutationFn: async () => {
      const items = lines.map((l) => ({ product_id: l.p.id, quantity: l.qty }));
      const { error } = await supabase.rpc("create_sale", { _items: items });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Vente enregistrée : ${money(total)}`);
      setCart({});
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold">Caisse</h1>
            <p className="text-muted-foreground">Encaissé aujourd'hui : <span className="font-semibold text-primary tabular">{money(todayTotal)}</span></p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher un produit…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {products.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">Ajoutez d'abord des produits dans « Produits & stocks ».</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {list.map((p) => {
              const out = p.stock === 0;
              return (
                <button key={p.id} disabled={out} onClick={() => add(p.id, 1)}
                  className="group rounded-xl border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                  <p className="line-clamp-2 min-h-10 font-semibold">{p.name}</p>
                  <p className="mt-2 font-display text-lg font-extrabold text-primary tabular">{money(p.sale_price)}</p>
                  <p className="text-xs text-muted-foreground">{out ? "Rupture" : `Stock : ${p.stock}`}{cart[p.id] ? ` · ${cart[p.id]} au panier` : ""}</p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="flex h-fit flex-col rounded-xl border bg-card lg:sticky lg:top-8">
        <div className="flex items-center gap-2 border-b p-4 font-bold"><ShoppingCart className="h-5 w-5 text-primary" /> Vente en cours</div>
        <div className="max-h-[50vh] flex-1 divide-y overflow-y-auto">
          {lines.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Touchez un produit pour l'ajouter.</p>}
          {lines.map(({ p, qty }) => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground tabular">{money(p.sale_price)} × {qty}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => add(p.id, -1)}><Minus className="h-3 w-3" /></Button>
                <span className="w-6 text-center text-sm font-semibold tabular">{qty}</span>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => add(p.id, 1)}><Plus className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => add(p.id, -qty)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-display text-3xl font-extrabold tabular">{money(total)}</span>
          </div>
          <Button size="lg" className="h-12 w-full text-base" disabled={lines.length === 0 || checkout.isPending} onClick={() => checkout.mutate()}>
            Encaisser
          </Button>
          {lines.length > 0 && <Button variant="ghost" className="w-full" onClick={() => setCart({})}>Annuler la vente</Button>}
        </div>
      </aside>
    </div>
  );
}
