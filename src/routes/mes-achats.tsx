import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, CheckCircle2, Library, LogOut, PlayCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { listMyLibrary, listMyPurchases } from "@/lib/learner.functions";
import { PURCHASES_KEY, type SavedPurchase } from "@/lib/learner-access";
import { PRODUCT_TYPE_LABELS } from "@/components/sales-page-view";

export const Route = createFileRoute("/mes-achats")({
  head: () => ({
    meta: [
      { title: "Mes achats — GestiPro" },
      { name: "description", content: "Votre bibliothèque de formations et produits numériques achetés." },
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

type Item = { orderId: string; token: string; product: string; title: string; type: string; shopName: string; paidAt: string | null; coverUrl: string | null; lessonsTotal?: number; lessonsDone?: number; lastLessonId?: string | null };

function MyPurchases() {
  const { session, loading } = useAuth();
  const qc = useQueryClient();
  const library = useServerFn(listMyLibrary);
  const deviceList = useServerFn(listMyPurchases);
  const [saved, setSaved] = useState<SavedPurchase[] | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(PURCHASES_KEY) ?? "[]"); setSaved(Array.isArray(v) ? v : []); } catch { setSaved([]); }
  }, []);
  const lib = useQuery({ queryKey: ["my-library", session?.user.id], queryFn: () => library(), enabled: !!session });
  const dev = useQuery({ queryKey: ["my-purchases", saved], queryFn: () => deviceList({ data: { items: saved ?? [] } }), enabled: !session && !loading && saved !== null && saved.length > 0 });

  const items: Item[] = session ? (lib.data ?? []) : (dev.data ?? []);
  const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = items.filter((i) => (type === "all" || i.type === type) && (!q.trim() || fold(i.title).includes(fold(q.trim()))));
  const busy = loading || (session ? lib.isLoading : saved === null || dev.isLoading);

  const signOut = async () => {
    await qc.cancelQueries(); qc.clear();
    await fetch("/api/digital-content", { method: "DELETE" });
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-muted/40 px-3 py-6 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Library className="h-6 w-6 text-primary" /> Mes achats</h1>
          {session && <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="max-w-[12rem] truncate">{session.user.email}</span><Button size="sm" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" /> Déconnexion</Button></div>}
        </div>

        {!loading && !session && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
            <p className="text-sm">Connectez-vous avec l'e-mail utilisé lors de l'achat pour retrouver tous vos achats, sur tous vos appareils.</p>
            <div className="flex gap-2">
              <Button asChild size="sm"><a href="/auth?client=1">Se connecter</a></Button>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Rechercher un achat" placeholder="Rechercher par nom…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
            <select aria-label="Type de produit" className="h-9 rounded-md border bg-background px-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">Tous les types</option>
              {Object.entries(PRODUCT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        )}

        {busy && <p className="text-muted-foreground">Chargement…</p>}
        {session && lib.isError && <p className="rounded-2xl border bg-card p-6 text-center text-sm text-destructive">Impossible de charger vos achats. <button className="underline" onClick={() => lib.refetch()}>Réessayer</button></p>}
        {!busy && items.length === 0 && (
          <div className="rounded-2xl border bg-card p-8 text-center" data-testid="empty-library">
            <BookOpen className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-2 font-semibold">Aucun achat pour l'instant</p>
            <p className="text-sm text-muted-foreground">{session ? "Les produits achetés avec votre e-mail apparaîtront ici après confirmation du paiement. Pour un achat fait avec un autre e-mail, ouvrez son lien de commande et cliquez sur « Ajouter à ma bibliothèque »." : "Aucun achat enregistré sur cet appareil."}</p>
          </div>
        )}
        {!busy && items.length > 0 && visible.length === 0 && <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">Aucun achat ne correspond à votre recherche.</p>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <div key={p.orderId} className="flex flex-col overflow-hidden rounded-2xl border bg-card" data-testid="purchase">
              {p.coverUrl ? <img src={p.coverUrl} alt="" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-primary/10"><BookOpen className="h-10 w-10 text-primary" /></div>}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="text-xs font-semibold uppercase text-primary">{PRODUCT_TYPE_LABELS[p.type] ?? "Produit"}{p.shopName && ` · ${p.shopName}`}</p>
                <h2 className="break-words font-bold">{p.title}</h2>
                <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  {p.paidAt && <span>Acheté le {new Date(p.paidAt).toLocaleDateString("fr-FR")}</span>}
                  <span className="flex items-center gap-1 font-semibold text-primary"><CheckCircle2 className="h-3.5 w-3.5" /> Accès actif</span>
                </div>
                <Button asChild className="mt-auto w-full">
                  <Link to="/apprendre/$product" params={{ product: p.product }} search={{ o: p.orderId, t: p.token || undefined, l: p.lastLessonId ?? undefined }}>
                    <PlayCircle className="h-4 w-4" /> Accéder à mon contenu
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">Propulsé par <Link to="/" className="hover:underline">GestiPro</Link></p>
      </div>
    </div>
  );
}
