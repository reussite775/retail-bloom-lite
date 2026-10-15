import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/studio/affilies")({
  head: () => ({
    meta: [
      { title: "Affiliés — Espace créateur GestiPro" },
      { name: "description", content: "Gérez les affiliés qui vendent vos produits numériques." },
      { property: "og:title", content: "Affiliés — Espace créateur GestiPro" },
      { property: "og:description", content: "Programme d'affiliation des produits numériques." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-3xl font-extrabold">Affiliés</h1>
      <div className="rounded-xl border bg-card p-6 text-muted-foreground">Aucun affilié pour l'instant. Le programme d'affiliation arrive bientôt.</div>
    </div>
  ),
});
