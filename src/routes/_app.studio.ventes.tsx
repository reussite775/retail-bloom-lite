import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/studio/ventes")({
  head: () => ({
    meta: [
      { title: "Ventes — Espace créateur GestiPro" },
      { name: "description", content: "Suivi des ventes de vos produits numériques." },
      { property: "og:title", content: "Ventes — Espace créateur GestiPro" },
      { property: "og:description", content: "Suivi des ventes de produits numériques." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-3xl font-extrabold">Vente</h1>
      <div className="rounded-xl border bg-card p-6 text-muted-foreground">Aucune vente pour l'instant. Le suivi des ventes de produits numériques arrive bientôt.</div>
    </div>
  ),
});
