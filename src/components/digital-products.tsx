import { useState } from "react";
import DOMPurify from "dompurify";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Copy, CopyPlus, FileDown, LayoutTemplate, Link2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { CatalogManagerButtons, categoriesQuery, collectionsQuery, collectionItemsQuery } from "./digital-catalog-manager";
import { DEFAULT_FILTERS, STATUS_LABELS, copiedPath, duplicateRow, filterCatalog, type CatalogFilters, type CatalogStatusFilter } from "@/lib/digital-catalog";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [form, setForm] = useState<{ title: string; description: string; price: string; slug: string; product_type: ProductType; category_id: string }>({ title: "", description: "", price: "", slug: "", product_type: "file", category_id: "" });
  const [cover, setCover] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const { data: categories = [] } = useQuery(categoriesQuery);
  const { data: collections = [] } = useQuery(collectionsQuery);
  const { data: collectionItems = [] } = useQuery(collectionItemsQuery);
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const membership = new Map<string, Set<string>>();
  collectionItems.forEach((i) => { if (!membership.has(i.product_id)) membership.set(i.product_id, new Set()); membership.get(i.product_id)!.add(i.collection_id); });
  const visible = filterCatalog(data, filters, membership);
  const counts = { active: data.filter((p) => p.status !== "archived").length, draft: data.filter((p) => p.status === "draft").length, published: data.filter((p) => p.status === "published").length, archived: data.filter((p) => p.status === "archived").length };
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name;

  const refresh = () => { qc.invalidateQueries({ queryKey: ["digital_products"] }); qc.invalidateQueries({ queryKey: ["digital_collection_items"] }); };

  const save = useMutation({
    mutationFn: async (publish: boolean | null) => {
      const title = form.title.trim();
      if (!title) throw new Error("Le titre est requis");
      if (cover && !cover.type.startsWith("image/")) throw new Error("La couverture doit être une image");
      if (!await checkSlug({ data: { kind: "product", slug: form.slug, productId: editing?.id } })) throw new Error("Nom public invalide, réservé ou déjà utilisé");
      const id = editing?.id ?? crypto.randomUUID();
      const row: TablesUpdate<"digital_products"> = { title, slug: form.slug, product_type: form.product_type, description: sanitizeRichText(DOMPurify.sanitize(form.description, { USE_PROFILES: { html: true } })), price: Math.max(0, Number(form.price) || 0), category_id: form.category_id || null };
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

  // Archive keeps every row, order and file; archived products are neither public nor purchasable.
  // Restoring returns the product to draft so nothing goes back on sale without the creator's action.
  const archive = useMutation({
    mutationFn: async (p: DP) => {
      const status = p.status === "archived" ? "draft" : "archived";
      const { error } = await supabase.from("digital_products").update({ status }).eq("id", p.id);
      if (error) throw error;
      return status;
    },
    onSuccess: (s) => { refresh(); toast.success(s === "archived" ? "Produit archivé" : "Produit restauré en brouillon"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Copies content, configuration and storage assets into a new draft; orders and buyers are never copied.
  const duplicate = useMutation({
    mutationFn: async (p: DP) => {
      const newId = crypto.randomUUID();
      const copied: { bucket: string; path: string }[] = [];
      const copyAsset = async (bucket: string, from: string | null) => {
        if (!from) return null;
        const to = copiedPath(shopId, newId, from);
        const { error } = await supabase.storage.from(bucket).copy(from, to);
        if (error) throw new Error("Copie du fichier impossible : " + error.message);
        copied.push({ bucket, path: to });
        return to;
      };
      try {
        const cover_path = await copyAsset("digital-covers", p.cover_path);
        const file_path = await copyAsset("digital-files", p.file_path);
        const { error } = await supabase.from("digital_products").insert(duplicateRow({ ...p, price: Number(p.price) }, newId, { cover_path, file_path }));
        if (error) throw error;
      } catch (e) {
        for (const c of copied) await supabase.storage.from(c.bucket).remove([c.path]);
        throw e;
      }
    },
    onSuccess: () => { refresh(); setFilters((f) => ({ ...f, status: f.status === "archived" || f.status === "published" ? "draft" : f.status })); toast.success("Copie créée en brouillon"); },
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

  const openNew = () => { setEditing(null); setForm({ title: "", description: "", price: "", slug: "", product_type: "file", category_id: "" }); setCover(null); setFile(null); setOpen(true); };
  const openEdit = (p: DP) => { setEditing(p); setForm({ title: p.title, description: p.description, price: String(p.price), slug: p.slug ?? suggestedSlug(p.title), product_type: (p.product_type as ProductType) || "file", category_id: p.category_id ?? "" }); setCover(null); setFile(null); setOpen(true); };
  const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";
  const statusTabs: { value: CatalogStatusFilter; label: string; n: number }[] = [
    { value: "active", label: "Actifs", n: counts.active },
    { value: "draft", label: "Brouillons", n: counts.draft },
    { value: "published", label: "Publiés", n: counts.published },
    { value: "archived", label: "Archivés", n: counts.archived },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold"><FileDown className="h-5 w-5 text-primary" /> Produits numériques</h2>
        <div className="flex flex-wrap gap-2">
          <CatalogManagerButtons shopId={shopId} products={data} />
          <Button onClick={openNew}><Plus className="h-4 w-4" /> Nouveau produit</Button>
        </div>
      </div>
      {data.length > 0 && (
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Statut">
            {statusTabs.map((t) => (
              <button key={t.value} type="button" role="tab" aria-selected={filters.status === t.value} onClick={() => setFilters({ ...filters, status: t.value })} className={`rounded-full px-3 py-1 text-sm font-medium transition ${filters.status === t.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>{t.label} <span className="tabular opacity-80">{t.n}</span></button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Rechercher un produit" placeholder="Rechercher par nom…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className="pl-8" /></div>
            <select aria-label="Type" className={selectCls} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="all">Tous les types</option>
              {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select aria-label="Catégorie" className={selectCls} value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}>
              <option value="all">Toutes les catégories</option>
              <option value="none">Sans catégorie</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select aria-label="Collection" className={selectCls} value={filters.collectionId} onChange={(e) => setFilters({ ...filters, collectionId: e.target.value })}>
              <option value="all">Toutes les collections</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) && <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Réinitialiser</Button>}
          </div>
        </div>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {!isLoading && data.length === 0 && <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Aucun produit numérique. Créez votre premier produit (e-book, formation, modèle…).</div>}
      {!isLoading && data.length > 0 && visible.length === 0 && <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Aucun produit ne correspond à ces filtres.</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-xl border bg-card">
            {p.coverUrl ? <img src={p.coverUrl} alt={p.title} className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-primary/10"><FileDown className="h-10 w-10 text-primary" /></div>}
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold leading-tight">{p.title}</h3>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.status === "published" ? "bg-primary/15 text-primary" : p.status === "archived" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{STATUS_LABELS[p.status] ?? "Brouillon"}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{typeLabel(p.product_type)}</span>
                  {catName(p.category_id) && <span className="max-w-[9rem] truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{catName(p.category_id)}</span>}
                </span>
              </div>
              <p className="font-display text-lg font-extrabold tabular">{money(p.price)}</p>
              {p.file_name ? <button onClick={() => download(p)} className="block truncate text-left text-xs text-primary hover:underline">{p.file_name}</button> : (p.product_type ?? "file") === "file" ? <p className="text-xs text-destructive">Aucun fichier</p> : <p className="text-xs text-muted-foreground">Sans fichier (facultatif)</p>}
              {p.status === "published" && (
                <div className="flex items-center gap-2 rounded-lg bg-muted p-2 text-xs">
                  <Link2 className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-all">{link(p)}</span>
                  <Button size="icon" variant="ghost" aria-label="Copier le lien" onClick={() => copy(p)} className="ml-auto shrink-0 text-primary"><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {p.status === "archived"
                  ? <Button size="sm" variant="outline" className="flex-1" disabled={archive.isPending} onClick={() => archive.mutate(p)}><ArchiveRestore className="h-4 w-4" /> Restaurer</Button>
                  : <Button size="sm" variant={p.status === "published" ? "outline" : "default"} className="flex-1" disabled={toggle.isPending} onClick={() => toggle.mutate(p)}>{p.status === "published" ? "Dépublier" : "Publier"}</Button>}
                <Button size="icon" variant="ghost" aria-label="Dupliquer" title="Dupliquer" disabled={duplicate.isPending} onClick={() => duplicate.mutate(p)}><CopyPlus className="h-4 w-4" /></Button>
                {p.status !== "archived" && <Button size="icon" variant="ghost" aria-label="Archiver" title="Archiver" disabled={archive.isPending} onClick={() => confirm(`Archiver « ${p.title} » ? Il ne sera plus en vente ; ses commandes sont conservées.`) && archive.mutate(p)}><Archive className="h-4 w-4" /></Button>}
                <Button size="icon" variant="ghost" aria-label="Modifier" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button asChild size="icon" variant="ghost" aria-label="Ouvrir le studio" title="Ouvrir le studio">
                  <Link to="/studio/produits/$id" params={{ id: p.id }}><LayoutTemplate className="h-4 w-4 text-primary" /></Link>
                </Button>
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
              <div className="space-y-1.5">
                <Label htmlFor="dp-category">Catégorie</Label>
                <select id="dp-category" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">Sans catégorie</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
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
