import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { attributeObject, optionalPrice, referenceConflict } from "@/lib/physical-catalog";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Variant = Tables<"product_variants">;
export function CatalogVariants({ product, variants, products, shop, onClose }: {
  product: Tables<"products">; variants: Variant[]; products: Tables<"products">[]; shop: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const list = variants.filter((v) => v.product_id === product.id);
  const [editing, setEditing] = useState<Variant | null>(null);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", barcode: "", sale: "", purchase: "", threshold: "5" });
  const [attrs, setAttrs] = useState([{ key: "Taille", value: "" }]);
  const open = (v: Variant | null) => {
    setEditing(v); setShow(true);
    setForm(v ? { name: v.name, sku: v.sku, barcode: v.barcode, sale: v.sale_price === null ? "" : String(v.sale_price), purchase: v.purchase_price === null ? "" : String(v.purchase_price), threshold: String(v.low_stock_threshold) } : { name: "", sku: "", barcode: "", sale: "", purchase: "", threshold: "5" });
    const a = v?.attributes;
    setAttrs(a && typeof a === "object" && !Array.isArray(a) ? Object.entries(a).map(([key, value]) => ({ key, value: String(value ?? "") })) : [{ key: "Taille", value: "" }]);
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!navigator.onLine) throw new Error("Une connexion est nécessaire pour enregistrer les variantes");
      if (!form.name.trim() || !form.sku.trim()) throw new Error("Le nom et la référence SKU sont requis");
      if (referenceConflict(form.sku, form.barcode, [...products, ...variants], editing?.id)) throw new Error("Cette référence ou ce code-barres existe déjà");
      const threshold = Number(form.threshold);
      if (!Number.isInteger(threshold) || threshold < 0) throw new Error("Seuil invalide");
      const row = { name: form.name.trim(), sku: form.sku.trim(), barcode: form.barcode.trim(), sale_price: optionalPrice(form.sale), purchase_price: optionalPrice(form.purchase), low_stock_threshold: threshold, attributes: attributeObject(attrs) };
      if (!editing && !list.length) {
        const { data, error } = await supabase.from("products").select("stock").eq("id", product.id).eq("user_id", shop).single();
        if (error) throw error;
        if (data.stock !== 0) throw new Error("Ce produit a déjà du stock. La conversion en variantes nécessite une répartition sécurisée du stock existant ; elle n’est pas encore disponible.");
      }
      const { error } = editing
        ? await supabase.from("product_variants").update(row).eq("id", editing.id).eq("organization_id", shop)
        : await supabase.from("product_variants").insert({ ...row, product_id: product.id, organization_id: shop, stock: 0 });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["catalog-options", shop] }); qc.invalidateQueries({ queryKey: ["products"] }); setShow(false); toast.success("Variante enregistrée"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
    <DialogHeader><DialogTitle>Variantes — {product.name}</DialogTitle></DialogHeader>
    {!show ? <><Button className="justify-self-start" onClick={() => open(null)}><Plus className="h-4 w-4" />Ajouter une variante</Button>
      <div className="divide-y">{list.map((v) => <div key={v.id} className="flex items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-words font-semibold">{v.name}{v.is_archived ? " · Archivée" : ""}</p><p className="break-all text-xs text-muted-foreground">{v.sku} · {v.barcode || "Sans code-barres"}</p><p className="mt-1 text-sm">{money(v.sale_price ?? product.sale_price)} · Stock {v.stock} {product.unit}</p></div><Button variant="ghost" size="icon" title="Modifier" aria-label={`Modifier ${v.name}`} onClick={() => open(v)}><Pencil className="h-4 w-4" /></Button></div>)}{!list.length && <p className="py-8 text-center text-muted-foreground">Aucune variante</p>}</div></> :
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="flex items-center justify-between"><h3 className="font-semibold">{editing ? "Modifier la variante" : "Nouvelle variante"}</h3><Button type="button" variant="ghost" size="icon" aria-label="Annuler la variante" onClick={() => setShow(false)}><X className="h-4 w-4" /></Button></div>
        <div className="grid gap-3 sm:grid-cols-2">{([['name','Nom'],['sku','Référence SKU'],['barcode','Code-barres'],['threshold',"Seuil d’alerte"]] as const).map(([k, label]) => <div key={k} className="space-y-1.5"><Label htmlFor={`variant-${k}`}>{label}</Label><Input id={`variant-${k}`} required={k === 'name' || k === 'sku'} type={k === 'threshold' ? 'number' : 'text'} min="0" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>)}</div>
        <div className="grid gap-3 sm:grid-cols-2">{([['purchase',"Prix d’achat (FCFA)"],['sale','Prix de vente (FCFA)']] as const).map(([k, label]) => <div key={k} className="space-y-1.5"><Label htmlFor={`variant-${k}`}>{label}</Label><Input id={`variant-${k}`} type="number" min="0" step="any" placeholder={String(k === 'sale' ? product.sale_price : product.purchase_price)} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>)}</div>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Attributs</legend>{attrs.map((a,i) => <div key={i} className="flex gap-2"><Input aria-label={`Attribut ${i+1}`} placeholder="Taille, couleur, modèle…" value={a.key} onChange={(e) => setAttrs(attrs.map((x,j) => j === i ? { ...x, key: e.target.value } : x))} /><Input aria-label={`Valeur ${i+1}`} placeholder="M, vert…" value={a.value} onChange={(e) => setAttrs(attrs.map((x,j) => j === i ? { ...x, value: e.target.value } : x))} /><Button type="button" size="icon" variant="ghost" className="shrink-0" aria-label={`Retirer l’attribut ${i+1}`} onClick={() => setAttrs(attrs.filter((_,j) => i !== j))}><X className="h-4 w-4" /></Button></div>)}<Button type="button" variant="outline" onClick={() => setAttrs([...attrs,{ key: "", value: "" }])}><Plus className="h-4 w-4" />Attribut</Button></fieldset>
        <p className="text-sm text-muted-foreground">Stock : {editing?.stock ?? 0} {product.unit}</p>
        <Button type="submit" disabled={save.isPending} className="w-full">{save.isPending ? "Enregistrement…" : "Enregistrer la variante"}</Button>
      </form>}
  </DialogContent></Dialog>;
}
