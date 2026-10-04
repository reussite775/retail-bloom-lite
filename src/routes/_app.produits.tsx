import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { productsQuery } from "@/lib/data";
import { money } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_app/produits")({
  head: () => ({
    meta: [
      { title: "Produits & stocks — Boutik" },
      { name: "description", content: "Gérez vos articles, prix et quantités en stock." },
      { property: "og:title", content: "Produits & stocks — Boutik" },
      { property: "og:description", content: "Gérez vos articles, prix et quantités en stock." },
    ],
  }),
  component: Products,
});

type Product = Tables<"products">;
type Form = { name: string; purchase_price: string; sale_price: string; stock: string };
const empty: Form = { name: "", purchase_price: "", sale_price: "", stock: "" };

function Products() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery(productsQuery);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Form>(empty);

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        name: form.name.trim(),
        purchase_price: Number(form.purchase_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        stock: Math.max(0, parseInt(form.stock) || 0),
      };
      if (!row.name) throw new Error("Le nom est requis");
      const { error } = editing
        ? await supabase.from("products").update(row).eq("id", editing.id)
        : await supabase.from("products").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setOpen(false); toast.success(editing ? "Produit modifié" : "Produit ajouté"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("products").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Produit supprimé"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, purchase_price: String(p.purchase_price), sale_price: String(p.sale_price), stock: String(p.stock) });
    setOpen(true);
  };

  const outCount = data.filter((p) => stockLevel(p.stock) === "out").length;
  const lowCount = data.filter((p) => stockLevel(p.stock) === "low").length;
  const list = data
    .filter((p) => matches(p.name, q))
    .filter((p) => filter === "all" || (filter === "alert" ? stockLevel(p.stock) !== "ok" : true));
  const margin = (Number(form.sale_price) || 0) - (Number(form.purchase_price) || 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Produits & stocks</h1>
          <p className="text-muted-foreground">{data.length} article(s)</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4" /> Ajouter un produit</Button>
      </div>
      {(outCount > 0 || lowCount > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {outCount > 0 && (
            <button onClick={() => setFilter("alert")} className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-left text-destructive">
              <AlertOctagon className="h-5 w-5 shrink-0" />
              <span><b>{outCount} produit(s) en rupture</b><br /><span className="text-sm">À réapprovisionner d'urgence</span></span>
            </button>
          )}
          {lowCount > 0 && (
            <button onClick={() => setFilter("alert")} className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning/15 p-4 text-left text-warning-foreground">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span><b>{lowCount} produit(s) en stock faible</b><br /><span className="text-sm">{LOW_STOCK} unités ou moins</span></span>
            </button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un article…" className="h-11 pl-9 pr-9" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} />
          {q && <button aria-label="Effacer" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {([["all", "Tous"], ["alert", "Alertes stock"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-3 py-1.5 font-medium ${filter === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Produit</th>
              <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Prix d'achat</th>
              <th className="px-4 py-3 text-right font-semibold">Prix de vente</th>
              <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Marge</th>
              <th className="px-4 py-3 text-right font-semibold">Stock</th>
              <th className="w-24 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Chargement…</td></tr>}
            {!isLoading && list.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{data.length ? "Aucun produit ne correspond." : "Aucun produit. Ajoutez votre premier article."}</td></tr>}
            {list.map((p) => {
              const lvl = stockLevel(p.stock);
              return (
              <tr key={p.id} className={`hover:bg-muted/50 ${lvl === "out" ? "bg-destructive/5" : lvl === "low" ? "bg-warning/5" : ""}`}>
                <td className="px-4 py-3 font-medium">
                  <span className="flex items-center gap-2">
                    {lvl === "out" && <AlertOctagon className="h-4 w-4 shrink-0 text-destructive" />}
                    {lvl === "low" && <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />}
                    {p.name}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-right tabular sm:table-cell">{money(p.purchase_price)}</td>
                <td className="px-4 py-3 text-right tabular">{money(p.sale_price)}</td>
                <td className="hidden px-4 py-3 text-right tabular text-primary sm:table-cell">{money(Number(p.sale_price) - Number(p.purchase_price))}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`inline-block min-w-10 whitespace-nowrap rounded-full px-2 py-0.5 text-center font-semibold tabular ${stockBadge[lvl]}`}>{lvl === "out" ? "Rupture" : p.stock}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label="Modifier"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Supprimer" onClick={() => confirm(`Supprimer « ${p.name} » ?`) && remove.mutate(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Modifier le produit" : "Nouveau produit"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-1.5"><Label>Nom</Label><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Prix d'achat (FCFA)</Label><Input type="number" min="0" step="any" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Prix de vente (FCFA)</Label><Input type="number" min="0" step="any" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Quantité en stock</Label><Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
            <p className="text-sm text-muted-foreground">Marge unitaire : <span className={margin < 0 ? "font-semibold text-destructive" : "font-semibold text-primary"}>{money(margin)}</span></p>
            <Button type="submit" className="w-full" disabled={save.isPending}>Enregistrer</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
