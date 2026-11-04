import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Layers, Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { STATUS_LABELS } from "@/lib/digital-catalog";

// All three tables are scoped to current_shop() by RLS; writes need shop admin.
export const categoriesQuery = {
  queryKey: ["digital_categories"],
  queryFn: async () => {
    const { data, error } = await supabase.from("digital_categories").select("*").order("name");
    if (error) throw error;
    return data;
  },
};
export const collectionsQuery = {
  queryKey: ["digital_collections"],
  queryFn: async () => {
    const { data, error } = await supabase.from("digital_collections").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};
export const collectionItemsQuery = {
  queryKey: ["digital_collection_items"],
  queryFn: async () => {
    const { data, error } = await supabase.from("digital_collection_items").select("collection_id, product_id, position");
    if (error) throw error;
    return data;
  },
};

const dbError = (e: { code?: string; message: string }) =>
  new Error(e.code === "23505" ? "Ce nom existe déjà" : e.code === "23514" ? "Nom vide ou trop long" : e.message);

type ProductLite = Pick<Tables<"digital_products">, "id" | "title" | "status">;

export function CategoriesDialog({ shopId, open, onOpenChange }: { shopId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: cats = [] } = useQuery(categoriesQuery);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["digital_categories"] }); qc.invalidateQueries({ queryKey: ["digital_products"] }); };

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("digital_categories").insert({ organization_id: shopId, name: name.trim() });
      if (error) throw dbError(error);
    },
    onSuccess: () => { setName(""); refresh(); toast.success("Catégorie créée"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rename = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("digital_categories").update({ name: editName.trim() }).eq("id", editId!);
      if (error) throw dbError(error);
    },
    onSuccess: () => { setEditId(null); refresh(); toast.success("Catégorie modifiée"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Products keep existing: the database sets their category to empty.
      const { error } = await supabase.from("digital_categories").delete().eq("id", id);
      if (error) throw dbError(error);
    },
    onSuccess: () => { refresh(); toast.success("Catégorie supprimée — les produits sont conservés"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Catégories</DialogTitle></DialogHeader>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
          <Input maxLength={80} placeholder="Nouvelle catégorie (ex. E-books)" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim() || add.isPending}><Plus className="h-4 w-4" /> Ajouter</Button>
        </form>
        {cats.length === 0 && <p className="text-sm text-muted-foreground">Aucune catégorie pour l'instant.</p>}
        <ul className="divide-y rounded-lg border">
          {cats.map((c) => (
            <li key={c.id} className="flex items-center gap-2 p-2">
              {editId === c.id ? (
                <>
                  <Input autoFocus maxLength={80} value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                  <Button size="icon" variant="ghost" aria-label="Valider" disabled={!editName.trim() || rename.isPending} onClick={() => rename.mutate()}><Check className="h-4 w-4 text-primary" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Annuler" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                  <Button size="icon" variant="ghost" aria-label={`Renommer ${c.name}`} onClick={() => { setEditId(c.id); setEditName(c.name); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Supprimer ${c.name}`} onClick={() => confirm(`Supprimer la catégorie « ${c.name} » ? Les produits seront conservés.`) && remove.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function CollectionsDialog({ shopId, products, open, onOpenChange }: { shopId: string; products: ProductLite[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: cols = [] } = useQuery(collectionsQuery);
  const { data: items = [] } = useQuery(collectionItemsQuery);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["digital_collections"] }); qc.invalidateQueries({ queryKey: ["digital_collection_items"] }); };
  const current = cols.find((c) => c.id === selected);
  const members = new Set(items.filter((i) => i.collection_id === selected).map((i) => i.product_id));

  const save = useMutation({
    mutationFn: async () => {
      const row = { name: form.name.trim(), description: form.description.trim().slice(0, 1000) };
      if (selected === "new") {
        const { data, error } = await supabase.from("digital_collections").insert({ ...row, organization_id: shopId }).select("id").single();
        if (error) throw dbError(error);
        return data.id;
      }
      const { error } = await supabase.from("digital_collections").update(row).eq("id", selected!);
      if (error) throw dbError(error);
      return selected!;
    },
    onSuccess: (id) => { setSelected(id); refresh(); toast.success("Collection enregistrée"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("digital_collections").delete().eq("id", id);
      if (error) throw dbError(error);
    },
    onSuccess: () => { setSelected(null); refresh(); toast.success("Collection supprimée — les produits sont conservés"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleMember = useMutation({
    mutationFn: async (productId: string) => {
      if (members.has(productId)) {
        const { error } = await supabase.from("digital_collection_items").delete().eq("collection_id", selected!).eq("product_id", productId);
        if (error) throw dbError(error);
      } else {
        const { error } = await supabase.from("digital_collection_items").insert({ collection_id: selected!, product_id: productId, organization_id: shopId, position: members.size });
        if (error) throw dbError(error);
      }
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const pick = (id: string | "new") => {
    setSelected(id);
    const c = cols.find((x) => x.id === id);
    setForm({ name: c?.name ?? "", description: c?.description ?? "" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSelected(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{selected ? (selected === "new" ? "Nouvelle collection" : current?.name ?? "Collection") : "Collections"}</DialogTitle></DialogHeader>
        {!selected ? (
          <div className="space-y-3">
            <Button onClick={() => pick("new")}><Plus className="h-4 w-4" /> Nouvelle collection</Button>
            {cols.length === 0 && <p className="text-sm text-muted-foreground">Aucune collection. Regroupez plusieurs produits (ex. « Pack débutant »).</p>}
            <ul className="divide-y rounded-lg border">
              {cols.map((c) => {
                const n = items.filter((i) => i.collection_id === c.id).length;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => pick(c.id)} className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted">
                      <Layers className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{c.name}</span>{c.description && <span className="block truncate text-xs text-muted-foreground">{c.description}</span>}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{n} produit{n > 1 ? "s" : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) save.mutate(); }}>
              <div className="space-y-1.5"><Label htmlFor="col-name">Nom</Label><Input id="col-name" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="col-desc">Description (facultative)</Label><Textarea id="col-desc" maxLength={1000} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={!form.name.trim() || save.isPending}>Enregistrer</Button>
                <Button type="button" variant="outline" onClick={() => setSelected(null)}>Retour</Button>
                {current && <Button type="button" variant="ghost" className="ml-auto text-destructive" onClick={() => confirm(`Supprimer la collection « ${current.name} » ? Les produits seront conservés.`) && remove.mutate(current.id)}><Trash2 className="h-4 w-4" /> Supprimer</Button>}
              </div>
            </form>
            {current && (
              <div className="space-y-2">
                <h3 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Produits de la collection ({members.size})</h3>
                {products.length === 0 && <p className="text-sm text-muted-foreground">Aucun produit.</p>}
                <ul className="divide-y rounded-lg border">
                  {products.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-3 p-2.5 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={members.has(p.id)} disabled={toggleMember.isPending} onChange={() => toggleMember.mutate(p.id)} aria-label={`${members.has(p.id) ? "Retirer" : "Ajouter"} ${p.title}`} />
                        <span className="min-w-0 flex-1 truncate">{p.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{STATUS_LABELS[p.status] ?? p.status}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Décocher retire le produit de la collection sans le supprimer.</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CatalogManagerButtons({ shopId, products }: { shopId: string; products: ProductLite[] }) {
  const [cat, setCat] = useState(false);
  const [col, setCol] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setCat(true)}><FolderTree className="h-4 w-4" /> Catégories</Button>
      <Button variant="outline" onClick={() => setCol(true)}><Layers className="h-4 w-4" /> Collections</Button>
      <CategoriesDialog shopId={shopId} open={cat} onOpenChange={setCat} />
      <CollectionsDialog shopId={shopId} products={products} open={col} onOpenChange={setCol} />
    </>
  );
}
