import { useCallback, useState } from "react";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, FolderOpen, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { ResourceList, contentKey } from "@/components/digital-resources";
import { CourseBuilder, CoursePreview } from "@/components/course-builder";
import { byPosition } from "@/lib/digital-content";

export const Route = createFileRoute("/_app/studio/produits_/$id_/contenu")({
  head: () => ({
    meta: [
      { title: "Contenu du produit — GestiPro" },
      { name: "description", content: "Gérez les ressources, modules et leçons de votre produit numérique." },
      { property: "og:title", content: "Contenu du produit — GestiPro" },
      { property: "og:description", content: "Ressources et programme de formation sur GestiPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContentPage,
});

type Tab = "program" | "resources" | "preview";

function ContentPage() {
  const { id } = Route.useParams();
  const { shopId } = useRole();
  const productQ = useQuery({
    queryKey: ["digital_products", id, "content-head"],
    queryFn: async () => {
      const { data, error } = await supabase.from("digital_products").select("id, title, product_type, status").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  // RLS limits all three tables to the creator's own shop.
  const contentQ = useQuery({
    queryKey: contentKey(id),
    queryFn: async () => {
      const [m, l, r] = await Promise.all([
        supabase.from("digital_modules").select("*").eq("product_id", id),
        supabase.from("digital_lessons").select("*").eq("product_id", id),
        supabase.from("digital_resources").select("*").eq("product_id", id),
      ]);
      if (m.error) throw m.error; if (l.error) throw l.error; if (r.error) throw r.error;
      return { modules: m.data, lessons: l.data, resources: r.data };
    },
  });
  const product = productQ.data;
  const isCourse = product?.product_type === "formation";
  const [tab, setTab] = useState<Tab | null>(null);
  const current: Tab = tab ?? (isCourse ? "program" : "resources");
  const [dirty, setDirty] = useState(false);
  const onDirty = useCallback((d: boolean) => setDirty(d), []);
  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm("Des modifications de la leçon ne sont pas enregistrées. Quitter quand même ?"),
    enableBeforeUnload: () => dirty,
  });

  if (productQ.isLoading || contentQ.isLoading) return <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (!product || !shopId) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 p-6">
        <h1 className="text-2xl font-extrabold">Produit introuvable</h1>
        <Link to="/studio/produits" className="text-primary hover:underline">Retour aux produits</Link>
      </div>
    );
  }
  const c = contentQ.data ?? { modules: [], lessons: [], resources: [] };
  const tabs: { value: Tab; label: string; icon: typeof Eye; show: boolean }[] = [
    { value: "program", label: "Programme", icon: GraduationCap, show: isCourse },
    { value: "resources", label: "Ressources du produit", icon: FolderOpen, show: true },
    { value: "preview", label: "Aperçu", icon: Eye, show: true },
  ];
  const switchTab = (t: Tab) => { if (dirty && !confirm("Des modifications de la leçon ne sont pas enregistrées. Les abandonner ?")) return; setDirty(false); setTab(t); };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button asChild size="icon" variant="ghost" aria-label="Retour aux produits" className="shrink-0"><Link to="/studio/produits"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">Contenu du produit</h1>
          <p className="truncate text-sm text-muted-foreground">{product.title}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="ml-auto shrink-0"><Link to="/studio/produits/$id" params={{ id }}>Page de vente</Link></Button>
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sections du contenu">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={current === t.value} onClick={() => switchTab(t.value)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${current === t.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}><t.icon className="h-4 w-4" />{t.label}</button>
        ))}
      </div>
      {!isCourse && current !== "preview" && <p className="text-xs text-muted-foreground">Le programme en modules et leçons est réservé aux produits de type Formation.</p>}
      {current === "program" && isCourse && <CourseBuilder shopId={shopId} productId={id} modules={c.modules} lessons={c.lessons} resources={c.resources} onDirtyChange={onDirty} />}
      {current === "resources" && (
        <section className="max-w-3xl rounded-xl border bg-card p-4">
          <ResourceList shopId={shopId} productId={id} lessonId={null} resources={c.resources.filter((r) => !r.lesson_id).sort(byPosition)} title="Ressources du produit" />
          <p className="mt-3 text-xs text-muted-foreground">Fichiers privés : ils ne sont jamais visibles sur la page de vente publique.</p>
        </section>
      )}
      {current === "preview" && <CoursePreview title={product.title} isCourse={isCourse} modules={c.modules} lessons={c.lessons} resources={c.resources} />}
    </div>
  );
}
