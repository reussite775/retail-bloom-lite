import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Monitor, Plus, Save, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { checkCreatorSlug } from "@/lib/creator-links.functions";
import { PublicSlugField } from "@/components/public-slug-field";
import { RichDescription } from "@/components/rich-description";
import { sanitizeRichText } from "@/lib/rich-text";
import { emptyPageConfig, normalizePageConfig, type PageConfig } from "@/lib/page-config";
import { SalesPageView, PRODUCT_TYPE_LABELS } from "@/components/sales-page-view";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_app/studio/produits/$id")({
  head: () => ({
    meta: [
      { title: "Studio de création — GestiPro" },
      { name: "description", content: "Composez la page de vente de votre produit numérique avec aperçu en direct." },
      { property: "og:title", content: "Studio de création — GestiPro" },
      { property: "og:description", content: "Composez la page de vente de votre produit numérique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudioPage,
});

type DP = Tables<"digital_products">;

type Form = {
  title: string;
  product_type: string;
  price: string;
  slug: string;
  description: string;
  config: PageConfig;
};

const formFrom = (p: DP): Form => ({
  title: p.title,
  product_type: p.product_type ?? "file",
  price: String(p.price),
  slug: p.slug ?? "",
  description: p.description,
  config: normalizePageConfig(p.page_config) ?? emptyPageConfig(),
});

// Petit éditeur de liste de textes (avantages, contenu inclus).
function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input value={item} maxLength={200} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" size="icon" variant="ghost" aria-label="Retirer" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, ""])}><Plus className="h-4 w-4" /> Ajouter</Button>
    </div>
  );
}

function StudioPage() {
  const { id } = Route.useParams();
  const { shopId } = useRole();
  const qc = useQueryClient();
  const checkSlug = useServerFn(checkCreatorSlug);
  const [form, setForm] = useState<Form | null>(null);
  const [slugAvailable, setSlugAvailable] = useState(true);
  const [cover, setCover] = useState<File | null>(null);
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");

  const { data: product, isLoading } = useQuery({
    queryKey: ["digital_product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("digital_products").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      let coverUrl: string | null = null;
      if (data.cover_path) {
        const { data: s } = await supabase.storage.from("digital-covers").createSignedUrl(data.cover_path, 3600);
        coverUrl = s?.signedUrl ?? null;
      }
      const { data: org } = await supabase.from("organizations").select("name").eq("id", data.organization_id).maybeSingle();
      return { ...data, coverUrl, shopName: org?.name ?? null };
    },
  });

  useEffect(() => {
    if (product && !form) setForm(formFrom(product));
  }, [product, form]);

  const coverPreview = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form || !product) return;
      const title = form.title.trim();
      if (!title) throw new Error("Le titre est requis");
      if (cover && !cover.type.startsWith("image/")) throw new Error("La couverture doit être une image");
      if (!await checkSlug({ data: { kind: "product", slug: form.slug, productId: product.id } })) throw new Error("Nom public invalide, réservé ou déjà utilisé");
      const row: TablesUpdate<"digital_products"> = {
        title,
        slug: form.slug,
        product_type: form.product_type,
        description: sanitizeRichText(DOMPurify.sanitize(form.description, { USE_PROFILES: { html: true } })),
        price: Math.max(0, Number(form.price) || 0),
        page_config: normalizePageConfig(form.config) as TablesUpdate<"digital_products">["page_config"],
      };
      if (cover) {
        const ext = (cover.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${product.organization_id}/${product.id}/cover-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("digital-covers").upload(path, cover, { contentType: cover.type });
        if (error) throw error;
        row.cover_path = path;
      }
      const { error } = await supabase.from("digital_products").update(row).eq("id", product.id);
      if (error) throw new Error(error.code === "23505" ? "Ce nom public est déjà utilisé" : error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["digital_product", id] });
      qc.invalidateQueries({ queryKey: ["digital_products"] });
      setCover(null);
      toast.success("Page de vente enregistrée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (!product) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 p-6">
        <h1 className="text-2xl font-extrabold">Produit introuvable</h1>
        <Link to="/studio/produits" className="text-primary hover:underline">Retour aux produits</Link>
      </div>
    );
  }
  if (!form) return null;

  const setConfig = (patch: Partial<PageConfig>) => setForm({ ...form, config: { ...form.config, ...patch } });

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="ghost" aria-label="Retour aux produits">
            <Link to="/studio/produits"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold">Studio de création</h1>
            <p className="text-sm text-muted-foreground">{product.title} · {product.status === "published" ? "Publié" : "Brouillon"}</p>
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !slugAvailable}>
          <Save className="h-4 w-4" /> {save.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Réglages */}
        <div className="space-y-6">
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Informations du produit</h2>
            <div className="space-y-1.5">
              <Label>Type de produit</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setForm({ ...form, product_type: value })} className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${form.product_type === value ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:border-primary/50"}`}>{label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5"><Label>Titre</Label><Input maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <PublicSlugField kind="product" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} productId={product.id} onAvailability={setSlugAvailable} />
          </section>

          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Contenu</h2>
            <div className="space-y-1.5"><Label>Description</Label><RichDescription value={form.description} onChange={(html) => setForm({ ...form, description: html })} /></div>
          </section>

          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Prix</h2>
            <div className="space-y-1.5"><Label>Prix (FCFA)</Label><Input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          </section>

          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Couverture</h2>
            <div className="space-y-1.5"><Label>Image de couverture {product.cover_path && "(laisser vide pour garder l'actuelle)"}</Label><Input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} /></div>
          </section>

          <section className="space-y-4 rounded-xl border bg-card p-4">
            <h2 className="border-b pb-1 text-sm font-bold uppercase tracking-wide text-primary">Sections de la page de vente</h2>
            <ListEditor label="Ce que le client va obtenir" items={form.config.benefits} onChange={(benefits) => setConfig({ benefits })} placeholder="Ex. : 100 prières prêtes à l'emploi" />
            <ListEditor label="Contenu inclus" items={form.config.included} onChange={(included) => setConfig({ included })} placeholder="Ex. : 1 fichier PDF de 80 pages" />
            <div className="space-y-2">
              <Label>Témoignages</Label>
              {form.config.testimonials.map((t, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <Input value={t.name} maxLength={80} placeholder="Nom" onChange={(e) => setConfig({ testimonials: form.config.testimonials.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <Input value={t.text} maxLength={500} placeholder="Témoignage" onChange={(e) => setConfig({ testimonials: form.config.testimonials.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfig({ testimonials: form.config.testimonials.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 text-destructive" /> Retirer</Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setConfig({ testimonials: [...form.config.testimonials, { name: "", text: "" }] })}><Plus className="h-4 w-4" /> Ajouter un témoignage</Button>
            </div>
            <div className="space-y-2">
              <Label>Questions fréquentes</Label>
              {form.config.faq.map((f, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <Input value={f.q} maxLength={200} placeholder="Question" onChange={(e) => setConfig({ faq: form.config.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                  <Input value={f.a} maxLength={1000} placeholder="Réponse" onChange={(e) => setConfig({ faq: form.config.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfig({ faq: form.config.faq.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 text-destructive" /> Retirer</Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setConfig({ faq: [...form.config.faq, { q: "", a: "" }] })}><Plus className="h-4 w-4" /> Ajouter une question</Button>
            </div>
            <div className="space-y-1.5">
              <Label>Texte du bouton d'action</Label>
              <Input maxLength={40} value={form.config.ctaLabel} placeholder="Ex. : Je commande maintenant" onChange={(e) => setConfig({ ctaLabel: e.target.value })} />
            </div>
          </section>
        </div>

        {/* Aperçu en direct */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-primary">Aperçu en direct</h2>
            <div className="flex gap-1 rounded-lg border p-1">
              <Button type="button" size="icon" variant={previewMode === "mobile" ? "default" : "ghost"} aria-label="Aperçu mobile" onClick={() => setPreviewMode("mobile")}><Smartphone className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant={previewMode === "desktop" ? "default" : "ghost"} aria-label="Aperçu ordinateur" onClick={() => setPreviewMode("desktop")}><Monitor className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className={`mx-auto transition-all ${previewMode === "mobile" ? "max-w-sm" : "max-w-2xl"}`}>
            <SalesPageView
              data={{
                title: form.title || product.title,
                description: form.description,
                price: Math.max(0, Number(form.price) || 0),
                coverUrl: coverPreview ?? product.coverUrl,
                shopName: product.shopName,
                productType: form.product_type,
                pageConfig: normalizePageConfig(form.config),
              }}
              onCta={() => toast.info("L'achat en ligne sera bientôt disponible.")}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">L'aperçu reflète exactement la page publique.</p>
        </div>
      </div>
    </div>
  );
}
