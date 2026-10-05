import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStats } from "./admin.index";

export const Route = createFileRoute("/admin/statistiques")({
  head: () => ({
    meta: [
      { title: "Statistiques — Admin GestiPro" },
      { name: "description", content: "Graphiques des inscriptions et de l'activité de la plateforme." },
      { property: "og:title", content: "Statistiques — Admin GestiPro" },
      { property: "og:description", content: "Graphiques des inscriptions et de l'activité de la plateforme." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Stats,
});

type P = "daily" | "weekly" | "monthly";

function Stats() {
  const { data, isLoading, error } = useStats();
  const [p, setP] = useState<P>("daily");
  if (isLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (error || !data) return <p className="text-destructive">{(error as Error)?.message ?? "Erreur"}</p>;
  const usage = [
    { label: "Boutiques", count: data.organizations },
    { label: "Utilisateurs", count: data.totalUsers },
    { label: "Actifs (30 j)", count: data.activeUsers },
    { label: "Suspendus", count: data.suspendedUsers },
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-bold">Nouvelles inscriptions</h2>
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {([["daily", "Par jour"], ["weekly", "Par semaine"], ["monthly", "Par mois"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setP(k)} className={`rounded-md px-3 py-1.5 font-medium ${p === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data[p]}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={30} />
              <Tooltip formatter={(v) => [v, "Inscriptions"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }} />
              <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-bold">Comptes et boutiques</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={usage} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <Tooltip formatter={(v) => [v, "Total"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }} />
              <Bar dataKey="count" fill="var(--primary)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{data.products.toLocaleString("fr-FR")} produits et {data.sales.toLocaleString("fr-FR")} ventes enregistrés sur la plateforme.</p>
      </div>
    </div>
  );
}
