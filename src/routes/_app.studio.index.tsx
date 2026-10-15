import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Link2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/studio/")({
  head: () => ({
    meta: [
      { title: "Espace créateur — GestiPro" },
      { name: "description", content: "Accueil de votre espace créateur numérique GestiPro." },
      { property: "og:title", content: "Espace créateur — GestiPro" },
      { property: "og:description", content: "Gérez vos produits numériques, ventes et affiliés." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioHome,
});

function StudioHome() {
  const q = useQuery({
    queryKey: ["digital_products", "summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("digital_products").select("status");
      if (error) throw error;
      return data;
    },
  });
  const list = q.data ?? [];
  const published = list.filter((p) => p.status === "published").length;
  const stats = [
    { label: "Produits numériques", value: list.length },
    { label: "Produits publiés", value: published },
    { label: "Brouillons", value: list.length - published },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Espace créateur</h1>
        <p className="text-muted-foreground">Vendez vos produits numériques.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-5">
            <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
            <p className="mt-3 font-display text-2xl font-extrabold tabular">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/studio/produits" className="rounded-xl border bg-card p-6 hover:bg-muted"><FileText className="h-5 w-5 text-primary" /><p className="mt-2 font-bold">Produits</p></Link>
        <Link to="/studio/ventes" className="rounded-xl border bg-card p-6 hover:bg-muted"><Link2 className="h-5 w-5 text-primary" /><p className="mt-2 font-bold">Vente</p></Link>
        <Link to="/studio/affilies" className="rounded-xl border bg-card p-6 hover:bg-muted"><Users className="h-5 w-5 text-primary" /><p className="mt-2 font-bold">Affiliés</p></Link>
      </div>
    </div>
  );
}
