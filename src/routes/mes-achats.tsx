import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Library, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyPurchases } from "@/lib/learner.functions";
import { PURCHASES_KEY, type SavedPurchase } from "@/lib/learner-access";
import { PRODUCT_TYPE_LABELS } from "@/components/sales-page-view";

export const Route = createFileRoute("/mes-achats")({
  head: () => ({
    meta: [
      { title: "Mes achats — GestiPro" },
      { name: "description", content: "Retrouvez vos formations et produits numériques achetés sur cet appareil." },
      { property: "og:title", content: "Mes achats — GestiPro" },
      { property: "og:description", content: "Vos formations et produits numériques sur GestiPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  ssr: false,
  component: MyPurchases,
});

function MyPurchases() {
  const [saved, setSaved] = useState<SavedPurchase[] | null>(null);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(PURCHASES_KEY) ?? "[]"); setSaved(Array.isArray(v) ? v : []); } catch { setSaved([]); }
  }, []);
  const list = useServerFn(listMyPurchases);
  const q = useQuery({ queryKey: ["my-purchases", saved], queryFn: () => list({ data: { items: saved ?? [] } }), enabled: saved !== null });

  return (
    <div className="min-h-screen bg-muted/40 px-3 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Library className="h-6 w-6 text-primary" /> Mes achats</h1>
        <p className="text-sm text-muted-foreground">Vos achats ouverts sur cet appareil apparaissent ici. Sur un autre appareil, ouvrez le lien reçu après votre paiement.</p>
        {(saved === null || q.isLoading) && <p className="text-muted-foreground">Chargement…</p>}
        {q.data && q.data.length === 0 && <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Aucun achat enregistré sur cet appareil.</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          {q.data?.map((p) => {
            const pct = p.lessonsTotal ? Math.round((p.lessonsDone / p.lessonsTotal) * 100) : 0;
            return (
              <div key={p.orderId} className="overflow-hidden rounded-2xl border bg-card" data-testid="purchase">
                {p.coverUrl ? <img src={p.coverUrl} alt="" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-primary/10"><BookOpen className="h-10 w-10 text-primary" /></div>}
                <div className="space-y-2 p-4">
                  <p className="text-xs font-semibold uppercase text-primary">{PRODUCT_TYPE_LABELS[p.type] ?? "Produit"}{p.shopName && ` · ${p.shopName}`}</p>
                  <h2 className="break-words font-bold">{p.title}</h2>
                  {p.type === "formation" && (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground"><span>{p.lessonsDone}/{p.lessonsTotal} leçons</span><span>{pct} %</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )}
                  <Button asChild className="w-full">
                    <Link to="/apprendre/$product" params={{ product: p.product }} search={{ o: p.orderId, t: p.token, l: p.lastLessonId ?? undefined }}>
                      <PlayCircle className="h-4 w-4" /> {p.type === "formation" ? (p.lessonsDone ? "Reprendre" : "Commencer") : "Accéder au contenu"}
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted-foreground">Propulsé par <Link to="/" className="hover:underline">GestiPro</Link></p>
      </div>
    </div>
  );
}
