import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matches } from "@/lib/stock";
import { listPlatformUsers, setUserSuspended } from "@/lib/superadmin.functions";

export const Route = createFileRoute("/admin/utilisateurs")({
  head: () => ({
    meta: [
      { title: "Utilisateurs — Admin GestiPro" },
      { name: "description", content: "Liste des comptes de la plateforme, recherche et suspension." },
      { property: "og:title", content: "Utilisateurs — Admin GestiPro" },
      { property: "og:description", content: "Liste des comptes de la plateforme, recherche et suspension." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UsersPage,
});

const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "jamais");

function UsersPage() {
  const list = useServerFn(listPlatformUsers);
  const suspend = useServerFn(setUserSuspended);
  const qc = useQueryClient();
  const { data = [], isLoading, error } = useQuery({ queryKey: ["sa-users"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "suspended">("all");
  const toggle = useMutation({
    mutationFn: (v: { userId: string; suspended: boolean }) => suspend({ data: v }),
    onSuccess: (_, v) => { toast.success(v.suspended ? "Compte suspendu" : "Compte réactivé"); qc.invalidateQueries({ queryKey: ["sa-users"] }); qc.invalidateQueries({ queryKey: ["sa-stats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const shown = data.filter((u) => (filter === "all" || (filter === "suspended") === u.suspended) && (!q || matches(`${u.name} ${u.email} ${u.shop}`, q)));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {([["all", `Tous (${data.length})`], ["active", "Actifs"], ["suspended", "Suspendus"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${filter === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nom, email, boutique…" className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading && <p className="p-8 text-center text-muted-foreground">Chargement…</p>}
        {error && <p className="p-8 text-center text-destructive">{(error as Error).message}</p>}
        {!isLoading && shown.length === 0 && <p className="p-8 text-center text-muted-foreground">Aucun utilisateur.</p>}
        <ul className="divide-y">
          {shown.map((u) => (
            <li key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold">{u.name || u.email}</p>
                <p className="truncate text-sm text-muted-foreground">{u.email}{u.shop ? ` · ${u.shop} (${u.role === "admin" ? "propriétaire" : "caissier"})` : ""}</p>
                <p className="text-xs text-muted-foreground">Inscrit le {d(u.created_at)} · dernière connexion : {d(u.last_sign_in_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.suspended ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-accent-foreground"}`}>{u.suspended ? "Suspendu" : "Actif"}</span>
                {!u.isSelf && (
                  <Button size="sm" variant={u.suspended ? "default" : "outline"} disabled={toggle.isPending}
                    onClick={() => { if (u.suspended || confirm(`Suspendre le compte ${u.email} ?`)) toggle.mutate({ userId: u.id, suspended: !u.suspended }); }}>
                    {u.suspended ? "Réactiver" : "Suspendre"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
