import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Pencil, Plus, Ruler, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { BASE_UNITS, categoryLabel } from "@/lib/physical-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CatalogTaxonomy({ shop, categories, units, onClose }: {
  shop: string; categories: Tables<"product_categories">[]; units: Tables<"product_units">[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"categories" | "units">("categories");
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      if (!navigator.onLine) throw new Error("Une connexion est nécessaire");
      if (!name.trim()) throw new Error("Le nom est requis");
      if (tab === "categories") {
        const row = { name: name.trim(), parent_id: parent || null };
        const { error } = editing
          ? await supabase.from("product_categories").update(row).eq("id", editing).eq("organization_id", shop)
          : await supabase.from("product_categories").insert({ ...row, organization_id: shop });
        if (error) throw error;
      } else {
        if ([...BASE_UNITS, ...units.map((u) => u.name)].some((u) => u.toLowerCase() === name.trim().toLowerCase())) throw new Error("Cette unité existe déjà");
        const { error } = await supabase.from("product_units").insert({ name: name.trim(), organization_id: shop });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["catalog-options", shop] }); setName(""); setParent(""); setEditing(null); toast.success("Enregistré"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
    <DialogHeader><DialogTitle>Organisation du catalogue</DialogTitle></DialogHeader>
    <div className="flex gap-2 border-b pb-3">
      <Button variant={tab === "categories" ? "default" : "outline"} onClick={() => { setTab("categories"); setName(""); setEditing(null); }}><FolderTree className="h-4 w-4" />Catégories</Button>
      <Button variant={tab === "units" ? "default" : "outline"} onClick={() => { setTab("units"); setName(""); setEditing(null); }}><Ruler className="h-4 w-4" />Unités</Button>
    </div>
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Label htmlFor="taxonomy-name">{tab === "categories" ? "Nom de la catégorie" : "Nouvelle unité"}</Label>
      <Input id="taxonomy-name" required value={name} onChange={(e) => setName(e.target.value)} />
      {tab === "categories" && <><Label htmlFor="category-parent">Catégorie parente</Label><select id="category-parent" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={parent} onChange={(e) => setParent(e.target.value)} disabled={!!editing && categories.some((c) => c.parent_id === editing)}>
        <option value="">Aucune — catégorie principale</option>{categories.filter((c) => !c.parent_id && c.id !== editing).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></>}
      <div className="flex gap-2"><Button disabled={save.isPending} type="submit"><Plus className="h-4 w-4" />{editing ? "Enregistrer" : "Ajouter"}</Button>{editing && <Button variant="ghost" type="button" onClick={() => { setEditing(null); setName(""); setParent(""); }}><X className="h-4 w-4" />Annuler</Button>}</div>
    </form>
    <div className="divide-y border-t">
      {tab === "categories" ? categories.map((c) => <div key={c.id} className="flex items-center justify-between gap-3 py-2"><span className="break-words text-sm">{categoryLabel(c, categories)}</span><Button variant="ghost" size="icon" aria-label={`Modifier ${c.name}`} title="Modifier" onClick={() => { setEditing(c.id); setName(c.name); setParent(c.parent_id ?? ""); }}><Pencil className="h-4 w-4" /></Button></div>) : [...BASE_UNITS, ...units.map((u) => u.name)].map((u) => <div key={u} className="py-3 text-sm">{u}</div>)}
      {tab === "categories" && !categories.length && <p className="py-6 text-center text-sm text-muted-foreground">Aucune catégorie</p>}
    </div>
  </DialogContent></Dialog>;
}