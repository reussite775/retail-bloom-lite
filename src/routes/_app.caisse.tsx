import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Minus, Plus, Search, ShoppingCart, X } from "lucide-react";
import { useRole } from "@/lib/role";
import { isNetworkError, queueSale } from "@/lib/offline";
import { matches, stockBadge, levelOf } from "@/lib/stock";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { customersQuery, productsQuery, profileQuery, todaySalesQuery } from "@/lib/data";
import { money } from "@/lib/format";
import { printReceipt, shareReceipt, type Receipt, type Shop } from "@/lib/receipt";

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
  const { session } = useAuth();
  const { shopId, isAdmin } = useRole();
  const { data: profile } = useQuery({ ...profileQuery(shopId), enabled: !!shopId });
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const { data: products = [] } = useQuery(productsQuery);
  const { data: today = [] } = useQuery(todaySalesQuery);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const { data: customers = [] } = useQuery(customersQuery);
  const [credit, setCredit] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [newMode, setNewMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

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
    mutationFn: async (): Promise<Receipt> => {
      const items = lines.map((l) => ({ product_id: l.p.id, quantity: l.qty }));
      const base = {
        date: new Date(),
        lines: lines.map((l) => ({ name: l.p.name, qty: l.qty, price: Number(l.p.sale_price) })),
        total,
      };
      const offline = (cid?: string, cname?: string): Receipt => {
        const q = queueSale({ items, customerId: cid, total });
        qc.setQueryData(productsQuery.queryKey, (old) =>
          old?.map((p) => { const l = lines.find((x) => x.p.id === p.id); return l ? { ...p, stock: p.stock - l.qty } : p; }));
        return { ...base, number: "HL-" + q.id.slice(0, 6).toUpperCase(), payment: (cid ? "Crédit" : "Espèces") + " (hors ligne)", customer: cname };
      };
      if (!credit) {
        if (!navigator.onLine) return offline();
        const { data, error } = await supabase.rpc("create_sale", { _items: items });
        if (error && isNetworkError(error)) return offline();
        if (error) throw error;
        return { ...base, number: String(data).slice(0, 8).toUpperCase(), payment: "Espèces" };
      }
      let cid = customerId;
      let cname = customers.find((c) => c.id === cid)?.name;
      if (newMode) {
        if (!navigator.onLine) throw new Error("Pas de connexion : choisissez un client existant ou attendez le retour du réseau.");
        if (!newName.trim()) throw new Error("Indiquez le nom du client");
        const { data, error } = await supabase.from("customers").insert({ name: newName.trim(), phone: newPhone.trim() }).select("id").single();
        if (error) throw error;
        cid = data.id; cname = newName.trim();
      }
      if (!cid) throw new Error("Choisissez un client");
      if (!navigator.onLine) return offline(cid, cname);
      const { data, error } = await supabase.rpc("create_credit_sale", { _items: items, _customer_id: cid });
      if (error && isNetworkError(error)) return offline(cid, cname);
      if (error) throw error;
      return { ...base, number: String(data).slice(0, 8).toUpperCase(), payment: "Crédit", customer: cname };
    },
    onSuccess: (r) => {
      if (r.number.startsWith("HL-")) toast.warning("Pas de connexion : vente enregistrée sur l'appareil. Elle sera envoyée automatiquement au retour du réseau.", { duration: 8000 });
      else toast.success(credit ? `Vente à crédit enregistrée : ${money(total)}` : `Vente enregistrée : ${money(total)}`);
      setReceipt(r);
      setCart({});
      setCredit(false); setCustomerId(""); setNewMode(false); setNewName(""); setNewPhone("");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = products.filter((p) => matches(p.name, q));

  return (
    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold">Caisse</h1>
            {isAdmin && <p className="text-muted-foreground">Encaissé aujourd'hui : <span className="font-semibold text-primary tabular">{money(todayTotal)}</span></p>}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus placeholder="Rechercher… (Entrée pour ajouter)" className="h-11 pl-9 pr-9" value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const first = list.find((p) => p.stock > 0);
                  if (first) { add(first.id, 1); setQ(""); }
                } else if (e.key === "Escape") setQ("");
              }} />
            {q && <button aria-label="Effacer" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}
          </div>
        </div>
        {products.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">Ajoutez d'abord des produits dans « Produits & stocks ».</div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">Aucun produit ne correspond à « {q} ».</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {list.map((p) => {
              const lvl = levelOf(p);
              const out = lvl === "out";
              return (
                <button key={p.id} disabled={out} onClick={() => add(p.id, 1)}
                  className="group rounded-xl border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                  <p className="line-clamp-2 min-h-10 font-semibold">{p.name}</p>
                  <p className="mt-2 font-display text-lg font-extrabold text-primary tabular">{money(p.sale_price)}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${stockBadge[lvl]}`}>{out ? "Rupture" : `Stock : ${p.stock}`}</span>
                    {cart[p.id] ? <span>· {cart[p.id]} au panier</span> : null}
                  </p>

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
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} /> Vente à crédit
          </label>
          {credit && (
            <div className="space-y-2 rounded-lg bg-muted p-3">
              {!newMode ? (
                <>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">Choisir un client…</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}{c.owed > 0 ? ` (doit ${money(c.owed)})` : ""}</option>)}
                  </select>
                  <Button variant="link" className="h-auto p-0" onClick={() => setNewMode(true)}>+ Nouveau client</Button>
                </>
              ) : (
                <>
                  <Input placeholder="Nom du client" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <Input placeholder="Téléphone" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                  <Button variant="link" className="h-auto p-0" onClick={() => setNewMode(false)}>Choisir un client existant</Button>
                </>
              )}
            </div>
          )}
          <Button size="lg" className="h-12 w-full text-base" disabled={lines.length === 0 || checkout.isPending} onClick={() => checkout.mutate()}>
            {credit ? "Enregistrer à crédit" : "Encaisser"}
          </Button>
          {lines.length > 0 && <Button variant="ghost" className="w-full" onClick={() => setCart({})}>Annuler la vente</Button>}
        </div>
      </aside>
      <ReceiptDialog receipt={receipt} shop={profile ? { shop_name: profile.shop_name, slogan: profile.slogan, contact: profile.contact, address: profile.address, logo_url: profile.logo_url } : null} onClose={() => setReceipt(null)} />
    </div>
  );
}

function ReceiptDialog({ receipt: r, shop, onClose }: { receipt: Receipt | null; shop: Shop | null; onClose: () => void }) {
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reçu de caisse</DialogTitle></DialogHeader>
        {r && shop && (
          <>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border bg-background p-4 font-mono text-sm">
              <div className="text-center">
                {shop.logo_url && <img src={shop.logo_url} alt="" className="mx-auto mb-2 max-h-16" />}
                <p className="text-base font-bold">{shop.shop_name}</p>
                {shop.slogan && <p className="italic text-muted-foreground">{shop.slogan}</p>}
                {shop.address && <p>{shop.address}</p>}
                {shop.contact && <p>{shop.contact}</p>}
              </div>
              <div className="my-2 border-t border-dashed" />
              <p>Reçu n° {r.number}</p>
              <p>{r.date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p>
              <div className="my-2 border-t border-dashed" />
              {r.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span>{l.name}<br /><span className="text-xs text-muted-foreground">{l.qty} × {money(l.price)}</span></span>
                  <span className="tabular">{money(l.qty * l.price)}</span>
                </div>
              ))}
              <div className="my-2 border-t border-dashed" />
              <div className="flex justify-between font-bold"><span>TOTAL</span><span>{money(r.total)}</span></div>
              <div className="flex justify-between"><span>Paiement</span><span>{r.payment}</span></div>
              {r.customer && <div className="flex justify-between"><span>Client</span><span>{r.customer}</span></div>}
              <div className="my-2 border-t border-dashed" />
              <p className="text-center">Merci de votre visite !</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => printReceipt(shop, r)}>Imprimer le reçu</Button>
              <Button variant="outline" onClick={() => shareReceipt(shop, r)}>Partager / Télécharger</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
