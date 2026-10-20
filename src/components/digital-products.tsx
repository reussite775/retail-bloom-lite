import { useState } from "react";
import DOMPurify from "dompurify";
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
import { digitalProductLink } from "@/lib/digital-links";
import { useServerFn } from "@tanstack/react-start";
import { checkCreatorSlug } from "@/lib/creator-links.functions";
import { PublicSlugField } from "./public-slug-field";
import { RichDescription } from "./rich-description";
import { sanitizeRichText } from "@/lib/rich-text";
import { suggestedSlug } from "@/lib/public-slugs";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

type DP = Tables<"digital_products"> & { coverUrl?: string | null };

const PRODUCT_TYPES = [
  { value: "file", label: "Fichier numérique" },
  { value: "formation", label: "Formation" },
  { value: "service", label: "Service" },
  { value: "coaching", label: "Coaching" },
] as const;
type ProductType = (typeof PRODUCT_TYPES)[number]["value"];
const typeLabel = (t: string | null | undefined) => PRODUCT_TYPES.find((x) => x.value === t)?.label ?? "Fichier numérique";

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

const ext = (f: File) => (f.name.includes(".") ? (f.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "") : "bin");

export function DigitalProducts({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const checkSlug = useServerFn(checkCreatorSlug);
  const [slugAvailable, setSlugAvailable] = useState(false);
  const { data = [], isLoading } = useQuery(digitalQuery);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DP | null>(null);
  const [form, setForm] = useState<{ title: string; description: string; price: string; slug: string; product_type: ProductType }>({ title: "", description: "", price: "", slug: "", product_type: "file" });
  const [cover, setCover] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["digital_products"] });

  const save = useMutation({
    mutationFn: async (publish: boolean | null) => {
      const title = form.title.trim();
      if (!title) throw new Error("Le titre est requis");
      if (cover && !cover.type.startsWith("image/")) throw new Error("La couverture doit être une image");
      if (!await checkSlug({ data: { kind: "product", slug: form.slug, productId: editing?.id } })) throw new Error("Nom public invalide, réservé ou déjà utilisé");
      const id = editing?.id ?? crypto.randomUUID();
      const row: TablesUpdate<"digital_products"> = { title, slug: form.slug, product_type: form.product_type, description: sanitizeRichText(DOMPurify.sanitize(form.description, { USE_PROFILES: { html: true } })), price: Math.max(0, Number(form.price) || 0) };
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
      if (row.status === "published" && form.product_type === "file" && !row.file_path && !editing?.file_path) throw new Error("Ajoutez le fichier avant de publier");
      const { error } = editing
        ? await supabase.from("digital_products").update(row).eq("id", id)
        : await supabase.from("digital_products").insert({ ...row, id, title, organization_id: shopId });
      if (error) throw new Error(error.code === "23505" ? "Ce nom public est déjà utilisé" : error.message);
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
    if (error || !s) { toast.error("Fichier inaccessible"); return; }
    window.open(s.signedUrl, "_blank");
  };

  const link = (p: DP) => digitalProductLink(p.slug ?? p.id);
  const copy = async (p: DP) => { try { await navigator.clipboard.writeText(link(p)); toast.success("Lien copié"); } catch { toast.error("Copie impossible. Sélectionnez le lien."); } };

  const openNew = () => { setEditing(null); setForm({ title: "", description: "", price: "", slug: "", product_type: "file" }); setCover(null); setFile(null); setOpen(true); };
  const openEdit = (p: DP) => { setEditing(p); setForm({ title: p.title, description: p.description, price: String(p.price), slug: p.slug ?? suggestedSlug(p.title), product_type: (p.product_type as ProductType) || "file" }); setCover(null); setFile(null); setOpen(true); };

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
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.status === "published" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{p.status === "published" ? "Publié" : "Brouillon"}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{typeLabel(p.product_type)}</span>
                </span>
              </div>
              <p className="font-display text-lg font-extrabold tabular">{money(p.price)}</p>
              {p.file_name ? <button onClick={() => download(p)} className="block truncate text-left text-xs text-primary hover:underline">{p.file_name}</button> : <p className="text-xs text-destructive">Aucun fichier</p>}
              {p.status === "published" && (
                <div className="flex items-center gap-2 rounded-lg bg-muted p-2 text-xs">
                  <Link2 className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-all">{link(p)}</span>
                  <Button size="icon" variant="ghost" aria-label="Copier le lien" onClick={() => copy(p)} className="ml-auto shrink-0 text-primary"><Copy className="h-3.5 w-3.5" /></Button>
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
          <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(null); }}>
            <section className="space-y-3">
              <h3 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Informations du produit</h3>
              <div className="space-y-1.5">
                <Label>Type de produit</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PRODUCT_TYPES.map((t) => (
                    <button key={t.value} type="button" onClick={() => setForm({ ...form, product_type: t.value })} className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${form.product_type === t.value ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:border-primary/50"}`}>{t.label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5"><Label>Titre</Label><Input maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, slug: !editing && (!form.slug || form.slug === suggestedSlug(form.title)) ? suggestedSlug(e.target.value) : form.slug })} /></div>
              <PublicSlugField kind="product" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} productId={editing?.id} onAvailability={setSlugAvailable} />
            </section>
            <section className="space-y-3">
              <h3 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Contenu</h3>
              <div className="space-y-1.5"><Label>Description</Label><RichDescription value={form.description} onChange={(html) => setForm({ ...form, description: html })} /></div>
              <div className="space-y-1.5"><Label>Fichier numérique (PDF ou autre, 50 Mo max) {form.product_type !== "file" && "— facultatif"} {editing?.file_name && `— actuel : ${editing.file_name}`}</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            </section>
            <section className="space-y-3">
              <h3 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Prix</h3>
              <div className="space-y-1.5"><Label>Prix (FCFA)</Label><Input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            </section>
            <section className="space-y-3">
              <h3 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Couverture</h3>
              <div className="space-y-1.5"><Label>Image de couverture {editing?.cover_path && "(laisser vide pour garder l'actuelle)"}</Label><Input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} /></div>
            </section>
            <section className="space-y-3">
              <h3 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Publication</h3>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" className="flex-1" disabled={save.isPending || !slugAvailable}>{editing ? "Enregistrer" : "Enregistrer en brouillon"}</Button>
                {editing?.status !== "published" && <Button type="button" className="flex-1" disabled={save.isPending || !slugAvailable} onClick={() => save.mutate(true)}>Enregistrer et publier</Button>}
              </div>
            </section>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
