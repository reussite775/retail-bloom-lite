import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileDown, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";

type DP = Tables<"digital_products"> & { coverUrl?: string | null };

// RLS limits rows to current_shop(); storage paths are prefixed by the shop id.
const digitalQuery = {
  queryKey: ["digital_products"],
  queryFn: async (): Promise<DP[]> => {
    const { data, error } = await supabase.from("digital_products").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    const paths = data.map((d) => d.cover_path).filter(Boolean) as string[];
    const urls: Record<string, string> = {};
    if (paths.length) {
      const { data: s } = await supabase.storage.from("digital-covers").createSignedUrls(paths, 3600);
      s?.forEach((x) => { if (x.path && x.signedUrl) urls[x.path] = x.signedUrl; });
    }
    return data.map((d) => ({ ...d, coverUrl: d.cover_path ? urls[d.cover_path] ?? null : null }));
  },
};

const ext = (f: File) => (f.name.includes(".") ? f.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "bin");

export function DigitalProducts({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery(digitalQuery);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DP | null>(null);
  const [form, setForm] = useState({ title: "", description: "", price: "" });
  const [cover, setCover] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["digital_products"] });

  const save = useMutation({
    mutationFn: async (publish: boolean | null) => {
      const title = form.title.trim();
      if (!title) throw new Error("Le titre est requis");
      if (cover && !cover.type.startsWith("image/")) throw new Error("La couverture doit être une image");
      const id = editing?.id ?? crypto.randomUUID();
      const row: Partial<DP> = { title, description: form.description.trim(), price: Math.max(0, Number(form.price) || 0) };
      if (cover) {
        const path = `${shopId}/${id}/cover-${Date.now()}.${ext(cover)}`;
        const { error } = await supabase.storage.from("digital-covers").upload(path, cover, { contentType: cover.type });
        if (error) throw error;
        row.cover_path = path;
      }
      if (file) {
        const path = `${shopId}/${id}/file-${Date.now()}.${ext(file)}`;
        const { error } = await supabase.storage.from("digital-files").upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (error) throw error;
        row.file_path = path;
        row.file_name = file.name.slice(0, 200);
      }
      if (publish !== null) row.status = publish ? "published" : "draft";
      if (row.status === "published" && !row.file_path && !editing?.file_path) throw new Error("Ajoutez le fichier avant de publier");
      const { error } = editing
        ? await supabase.from("digital_products").update(row).eq("id", id)
        : await supabase.from("digital_products").insert({ ...row, id, title, organization_id: shopId });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); setOpen(false); toast.success("Produit enregistré"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (p: DP) => {
      const { error } = await supabase.from("digital_products").update({ status: p.status === "published" ? "draft" : "published" }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (p: DP) => {
      const { error } = await supabase.from("digital_products").delete().eq("id", p.id);
      if (error) throw error;
      if (p.file_path) await supabase.storage.from("digital-files").remove([p.file_path]);
      if (p.cover_path) await supabase.storage.from("digital-covers").remove([p.cover_path]);
    },
    onSuccess: () => { refresh(); toast.success("Produit supprimé"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const download = async (p: DP) => {
    if (!p.file_path) return;
    const { data: s, error } = await supabase.storage.from("digital-files").createSignedUrl(p.file_path, 60, { download: p.file_name ?? true });
    if (error || !s) return toast.error("Fichier inaccessible");
    window.open(s.signedUrl, "_blank");
  };

  const link = (p: DP) => `${window.location.origin}/p/${p.id}`;
  const copy = async (p: DP) => { await navigator.clipboard.writeText(link(p)); toast.success("Lien copié"); };

  const openNew = () => { setEditing(null); setForm({ title: "", description: "", price: "" }); setCover(null); setFile(null); setOpen(true); };
  const openEdit = (p: DP) => { setEditing(p); setForm({ title: p.title, description: p.description, price: String(p.price) }); setCover(null); setFile(null); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold"><FileDown className="h-5 w-5 text-primary" /> Produits numériques</h2>
        <Button onClick={openNew}><Plus className="h-4 w-4" /> Nouveau produit</Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {!isLoading && data.length === 0 && <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Aucun produit numérique. Créez votre premier produit (e-book, formation, modèle…).</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-xl border bg-card">
            {p.coverUrl ? <img src={p.coverUrl} alt={p.title} className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-primary/10"><FileDown className="h-10 w-10 text-primary" /></div>}
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold leading-tight">{p.title}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${p.status === "published" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{p.status === "published" ? "Publié" : "Brouillon"}</span>
              </div>
              <p className="font-display text-lg font-extrabold tabular">{money(p.price)}</p>
              {p.file_name ? <button onClick={() => download(p)} className="block truncate text-left text-xs text-primary hover:underline">{p.file_name}</button> : <p className="text-xs text-destructive">Aucun fichier</p>}
              {p.status === "published" && (
                <div className="flex items-center gap-2 rounded-lg bg-muted p-2 text-xs">
                  <Link2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{link(p)}</span>
                  <button aria-label="Copier le lien" onClick={() => copy(p)} className="ml-auto shrink-0 text-primary"><Copy className="h-3.5 w-3.5" /></button>
                </div>
              )}
              <div className="flex gap-1">
                <Button size="sm" variant={p.status === "published" ? "outline" : "default"} className="flex-1" disabled={toggle.isPending} onClick={() => toggle.mutate(p)}>{p.status === "published" ? "Dépublier" : "Publier"}</Button>
                <Button size="icon" variant="ghost" aria-label="Modifier" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Supprimer" onClick={() => confirm(`Supprimer « ${p.title} » ?`) && remove.mutate(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Modifier le produit" : "Nouveau produit numérique"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(null); }}>
            <div className="space-y-1.5"><Label>Titre</Label><Input maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={4} maxLength={5000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Prix (FCFA)</Label><Input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Image de couverture {editing?.cover_path && "(laisser vide pour garder l'actuelle)"}</Label><Input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} /></div>
            <div className="space-y-1.5"><Label>Fichier numérique (PDF ou autre, 50 Mo max) {editing?.file_name && `— actuel : ${editing.file_name}`}</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline" className="flex-1" disabled={save.isPending}>{editing ? "Enregistrer" : "Enregistrer en brouillon"}</Button>
              {editing?.status !== "published" && <Button type="button" className="flex-1" disabled={save.isPending} onClick={() => save.mutate(true)}>Enregistrer et publier</Button>}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
