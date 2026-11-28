import { isNetworkError, queueOp } from "@/lib/offline";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ArrowDownUp, Boxes, FolderTree, Layers, Pencil, Plus, Search } from "lucide-react";
import { stockBadge, levelOf } from "@/lib/stock";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CatalogTaxonomy } from "@/components/catalog-taxonomy";
import { CatalogVariants } from "@/components/catalog-variants";
import { CatalogMovements } from "@/components/catalog-movements";
import { BASE_UNITS, catalogOptionsQuery, categoryLabel, catalogMatches, optionalPrice, referenceConflict } from "@/lib/physical-catalog";
import { supabase } from "@/integrations/supabase/client";
import { productsQuery } from "@/lib/data";
import { useRole } from "@/lib/role";
import { money } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";

type SearchState = { q?: string; category?: string; filter?: "all" | "alert" | "archived"; sort?: "name" | "stock" | "price" };
export const Route = createFileRoute("/_app/produits")({
  validateSearch: (s: Record<string, unknown>): SearchState => ({ q: typeof s['q'] === 'string' ? s['q'] : '', category: typeof s['category'] === 'string' ? s['category'] : '', filter: s['filter'] === 'alert' || s['filter'] === 'archived' ? s['filter'] : 'all', sort: s['sort'] === 'stock' || s['sort'] === 'price' ? s['sort'] : 'name' }),
  head: () => ({ meta: [
    { title: "Produits & stocks — GestiPro" },
    { name: "description", content: "Catalogue, références SKU, variantes et mouvements de stock de votre boutique." },
    { property: "og:title", content: "Produits & stocks — GestiPro" },
    { property: "og:description", content: "Catalogue, références SKU, variantes et mouvements de stock de votre boutique." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Products,
});
type Product = Tables<"products">;
type Form = { name: string; sku: string; barcode: string; category_id: string; unit: string; description: string; purchase_price: string; sale_price: string; stock: string; threshold: string };
const empty: Form = { name: '', sku: '', barcode: '', category_id: '', unit: 'pièce', description: '', purchase_price: '', sale_price: '', stock: '0', threshold: '5' };
function Products() {
  const qc = useQueryClient();
  const { shopId, isAdmin } = useRole();
  const { data = [], isLoading, error } = useQuery(productsQuery);
  const options = useQuery({ ...catalogOptionsQuery(shopId), enabled: !!shopId });
  const categories = options.data?.categories ?? [];
  const variants = options.data?.variants ?? [];
  const units = [...new Set([...BASE_UNITS, ...(options.data?.units.map((u) => u.name) ?? [])])];
  const search = Route.useSearch(); const navigate = Route.useNavigate();
  const setSearch = (patch: SearchState) => navigate({ search: (s) => ({ ...s, ...patch }), replace: true });
  const [open,setOpen] = useState(false); const [taxonomy,setTaxonomy] = useState(false);
  const [editing,setEditing] = useState<Product | null>(null); const [form,setForm] = useState<Form>(empty);
  const [variantProduct,setVariantProduct] = useState<Product | null>(null); const [stockProduct,setStockProduct] = useState<Product | null>(null);
  const save = useMutation({ mutationFn: async () => {
    if (!isAdmin) throw new Error('Accès refusé');
    if (!form.name.trim() || !form.sku.trim()) throw new Error('Le nom et la référence SKU sont requis');
    if (options.isError || !options.data) throw new Error('Les références du catalogue sont indisponibles. Réessayez.');
    if (referenceConflict(form.sku,form.barcode,[...data,...variants],editing?.id)) throw new Error('Cette référence ou ce code-barres existe déjà');
    const threshold = Number(form.threshold); const stock = Number(form.stock);
    if (!Number.isInteger(threshold) || threshold < 0 || (!editing && (!Number.isInteger(stock) || stock < 0))) throw new Error('Quantité ou seuil invalide');
    const row = { name: form.name.trim(), sku: form.sku.trim(), barcode: form.barcode.trim(), category_id: form.category_id || null, unit: form.unit, description: form.description.trim(), purchase_price: optionalPrice(form.purchase_price) ?? 0, sale_price: optionalPrice(form.sale_price) ?? 0, low_stock_threshold: threshold, ...(!editing ? { stock } : {}) };
    const queue = () => {
      if (editing) { queueOp('product_update',{ id: editing.id,...row },`Modification de ${row.name}`); qc.setQueriesData({ queryKey: ['products'] }, (old: unknown) => Array.isArray(old) ? old.map((p: Product) => p.id === editing.id ? { ...p,...row } : p) : old); }
      else queueOp('product_insert',row,`Ajout de ${row.name}`);
      return true;
    };
    if (!navigator.onLine) return queue();
    const { error } = editing ? await supabase.from('products').update(row).eq('id',editing.id).eq('user_id',shopId) : await supabase.from('products').insert({ ...row,user_id: shopId });
    if (error && isNetworkError(error)) return queue(); if (error) throw error; return false;
  }, onSuccess: (queued) => { if (!queued) qc.invalidateQueries({ queryKey: ['products'] }); setOpen(false); toast.success(queued ? 'Modification conservée sur cet appareil, en attente du réseau' : 'Produit enregistré'); }, onError: (e: Error) => toast.error(e.message) });
  const edit = (p: Product | null) => {
    setEditing(p); setForm(p ? { name:p.name,sku:p.sku,barcode:p.barcode,category_id:p.category_id ?? '',unit:p.unit,description:p.description,purchase_price:String(p.purchase_price),sale_price:String(p.sale_price),stock:String(p.stock),threshold:String(p.low_stock_threshold) } : { ...empty,sku:`SKU-${crypto.randomUUID().slice(0,8).toUpperCase()}` }); setOpen(true);
  };
  const active = data.filter((p) => !p.is_archived);
  const alerts = active.filter((p) => p.has_variants ? variants.some((v) => v.product_id === p.id && !v.is_archived && levelOf(v) !== 'ok') : levelOf(p) !== 'ok');
  const list = data.filter((p) => search.filter === 'archived' ? p.is_archived : !p.is_archived)
    .filter((p) => catalogMatches(p,search.q ?? '',variants.filter((v) => v.product_id === p.id)))
    .filter((p) => !search.category || p.category_id === search.category || categories.some((c) => c.id === p.category_id && c.parent_id === search.category))
    .filter((p) => search.filter !== 'alert' || alerts.some((a) => a.id === p.id))
    .sort((a,b) => search.sort === 'stock' ? a.stock-b.stock : search.sort === 'price' ? a.sale_price-b.sale_price : a.name.localeCompare(b.name,'fr'));
  const margin = Number(form.sale_price || 0)-Number(form.purchase_price || 0);
  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-extrabold">Produits & stocks</h1><p className="mt-1 text-muted-foreground">{active.length} produits · {variants.filter((v) => !v.is_archived).length} variantes</p></div>{isAdmin && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setTaxonomy(true)} disabled={!options.data}><FolderTree className="h-4 w-4" />Catégories & unités</Button><Button onClick={() => edit(null)}><Plus className="h-4 w-4" />Ajouter un produit</Button></div>}</div>
    {alerts.length > 0 && <Button variant="outline" className="h-auto w-full justify-start border-warning/50 bg-warning/10 p-3 text-warning-foreground" onClick={() => setSearch({ filter:'alert' })}><AlertTriangle className="h-5 w-5" />{alerts.length} produit(s) en stock bas ou en rupture</Button>}
    {(error || options.error) && <div role="alert" className="text-sm text-destructive">Impossible de charger une partie du catalogue.<Button variant="link" onClick={() => { qc.invalidateQueries({ queryKey:['products'] }); options.refetch(); }}>Réessayer</Button></div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Rechercher un produit" placeholder="Nom, SKU, code-barres, variante…" className="pl-9" value={search.q ?? ''} onChange={(e) => setSearch({ q:e.target.value })} /></div>
      <select aria-label="Filtrer par catégorie" className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm" value={search.category ?? ''} onChange={(e) => setSearch({ category:e.target.value })}><option value="">Toutes les catégories</option>{categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c,categories)}</option>)}</select>
      <select aria-label="Filtrer par stock" className="h-10 rounded-md border bg-background px-3 text-sm" value={search.filter ?? 'all'} onChange={(e) => setSearch({ filter:e.target.value === 'alert' ? 'alert' : e.target.value === 'archived' ? 'archived' : 'all' })}><option value="all">Produits actifs</option><option value="alert">Alertes stock</option><option value="archived">Archivés</option></select>
      <select aria-label="Trier les produits" className="h-10 rounded-md border bg-background px-3 text-sm" value={search.sort ?? 'name'} onChange={(e) => setSearch({ sort:e.target.value === 'stock' ? 'stock' : e.target.value === 'price' ? 'price' : 'name' })}><option value="name">Nom A–Z</option><option value="stock">Stock croissant</option><option value="price">Prix croissant</option></select>
    </div>
    <div className="overflow-x-auto border-y"><table className="w-full text-sm"><thead className="bg-muted text-left text-muted-foreground"><tr><th className="p-3">Produit / référence</th><th className="hidden p-3 sm:table-cell">Catégorie</th><th className="p-3 text-right">Prix de vente</th><th className="p-3 text-right">Stock</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y">
      {isLoading && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Chargement…</td></tr>}{!isLoading && !list.length && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground"><Boxes className="mx-auto mb-3 h-8 w-8" />Aucun produit trouvé</td></tr>}
      {list.map((p) => { const c = categories.find((x) => x.id === p.category_id); const lvl = levelOf(p); return <tr key={p.id} className="hover:bg-muted/40"><td className="p-3"><p className="font-semibold">{p.name}</p><p className="break-all text-xs text-muted-foreground">{p.sku || 'Sans référence'}{p.barcode ? ` · ${p.barcode}` : ''}</p>{p.has_variants && <span className="text-xs text-primary">{variants.filter((v) => v.product_id === p.id && !v.is_archived).length} variantes</span>}</td><td className="hidden p-3 text-muted-foreground sm:table-cell">{c ? categoryLabel(c,categories) : '—'}</td><td className="whitespace-nowrap p-3 text-right font-medium tabular">{money(p.sale_price)}</td><td className="p-3 text-right"><span className={`rounded-md px-2 py-1 font-semibold ${stockBadge[lvl]}`}>{p.stock}</span><p className="mt-1 text-xs text-muted-foreground">{p.unit}</p></td><td className="p-3">{isAdmin && <div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="Modifier le produit" aria-label={`Modifier ${p.name}`} onClick={() => edit(p)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Variantes" aria-label={`Variantes de ${p.name}`} disabled={!options.data} onClick={() => setVariantProduct(p)}><Layers className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Mouvements de stock" aria-label={`Stock de ${p.name}`} disabled={!options.data} onClick={() => setStockProduct(p)}><ArrowDownUp className="h-4 w-4" /></Button></div>}</td></tr>; })}
    </tbody></table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}><DialogHeader><DialogTitle>{editing ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="space-y-1.5"><Label htmlFor="product-name">Nom du produit</Label><Input id="product-name" required autoFocus value={form.name} onChange={(e) => setForm({ ...form,name:e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-2">{([['sku','Référence SKU'],['barcode','Code-barres']] as const).map(([k,l]) => <div key={k} className="space-y-1.5"><Label htmlFor={`product-${k}`}>{l}</Label><Input id={`product-${k}`} required={k === 'sku'} value={form[k]} onChange={(e) => setForm({ ...form,[k]:e.target.value })} /></div>)}</div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="product-category">Catégorie / sous-catégorie</Label><select id="product-category" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.category_id} onChange={(e) => setForm({ ...form,category_id:e.target.value })}><option value="">Sans catégorie</option>{categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c,categories)}</option>)}</select></div><div className="space-y-1.5"><Label htmlFor="product-unit">Unité de mesure</Label><select id="product-unit" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.unit} onChange={(e) => setForm({ ...form,unit:e.target.value })}>{[...new Set([...units,form.unit])].map((u) => <option key={u}>{u}</option>)}</select></div></div>
        <div className="grid grid-cols-2 gap-3">{([['purchase_price',"Prix d’achat (FCFA)"],['sale_price','Prix de vente (FCFA)'],['stock',editing ? 'Stock actuel' : 'Stock initial'],['threshold',"Seuil d’alerte"]] as const).map(([k,l]) => <div key={k} className="space-y-1.5"><Label htmlFor={`product-${k}`}>{l}</Label><Input id={`product-${k}`} type="number" min="0" step={k.includes('price') ? 'any' : '1'} readOnly={k === 'stock' && !!editing} value={form[k]} onChange={(e) => setForm({ ...form,[k]:e.target.value })} /></div>)}</div>
        <p className="text-sm text-muted-foreground">Marge unitaire : <b className={margin < 0 ? 'text-destructive' : 'text-primary'}>{money(margin)}</b></p>
        <div className="space-y-1.5"><Label htmlFor="product-description">Description</Label><textarea id="product-description" rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form,description:e.target.value })} /></div>
        <Button type="submit" className="w-full" disabled={save.isPending || !options.data}>{save.isPending ? 'Enregistrement…' : 'Enregistrer le produit'}</Button>
      </form>
    </DialogContent></Dialog>
    {taxonomy && <CatalogTaxonomy shop={shopId} categories={categories} units={options.data?.units ?? []} onClose={() => setTaxonomy(false)} />}
    {variantProduct && <CatalogVariants shop={shopId} product={data.find((p) => p.id === variantProduct.id) ?? variantProduct} variants={variants} products={data} onClose={() => setVariantProduct(null)} />}
    {stockProduct && <CatalogMovements shop={shopId} product={data.find((p) => p.id === stockProduct.id) ?? stockProduct} variants={variants} onClose={() => setStockProduct(null)} />}
  </div>;
}
