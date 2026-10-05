import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Boxes, Receipt, Store, UserPlus, Users, UserX } from "lucide-react";
import { getPlatformStats } from "@/lib/superadmin.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Vue d'ensemble — Admin GestiPro" },
      { name: "description", content: "Chiffres clés de la plateforme GestiPro." },
      { property: "og:title", content: "Vue d'ensemble — Admin GestiPro" },
      { property: "og:description", content: "Chiffres clés de la plateforme GestiPro." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Overview,
});

export function useStats() {
  const fn = useServerFn(getPlatformStats);
  return useQuery({ queryKey: ["sa-stats"], queryFn: () => fn() });
}

function Overview() {
  const { data, isLoading, error } = useStats();
  if (isLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (error || !data) return <p className="text-destructive">{(error as Error)?.message ?? "Erreur"}</p>;
  const cards = [
    { label: "Utilisateurs inscrits", value: data.totalUsers, icon: Users },
    { label: "Utilisateurs actifs", value: data.activeUsers, sub: "connectés ces 30 derniers jours", icon: Activity },
    { label: "Nouveaux utilisateurs", value: data.newUsers, sub: "ces 7 derniers jours", icon: UserPlus },
    { label: "Comptes suspendus", value: data.suspendedUsers, icon: UserX },
    { label: "Boutiques", value: data.organizations, icon: Store },
    { label: "Abonnements actifs", value: data.subscribedShops, sub: "boutiques avec abonnement payé", icon: Store },
    { label: "En période d'essai", value: data.trialShops, icon: Store },
    { label: "Abonnements expirés", value: data.expiredShops, sub: "essai ou abonnement terminé", icon: Store },
    { label: "Produits enregistrés", value: data.products, icon: Boxes },
    { label: "Ventes enregistrées", value: data.sales, icon: Receipt },
  ];
  const today = data.daily?.[data.daily.length - 1]?.count ?? 0;
  const week = data.weekly?.[data.weekly.length - 1]?.count ?? 0;
  const month = data.monthly?.[data.monthly.length - 1]?.count ?? 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">{c.label}</p><c.icon className="h-5 w-5 text-primary" /></div>
            <p className="mt-3 font-display text-3xl font-extrabold tabular">{Number(c.value ?? 0).toLocaleString("fr-FR")}</p>
            {c.sub && <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>}
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-bold">Inscriptions</h2>
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          {[["Aujourd'hui", today], ["Cette semaine", week], ["Ce mois-ci", month]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg bg-muted p-4"><p className="font-display text-2xl font-extrabold tabular">{v}</p><p className="text-sm text-muted-foreground">{l}</p></div>
          ))}
        </div>
      </div>
    </div>
  );
}
