import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, Crown, Search, Store, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { matches } from "@/lib/stock";
import { PLANS, type PlanId } from "@/lib/plans";
import { listMerchants, updateSubscription } from "@/lib/superadmin.functions";

export const Route = createFileRoute("/admin/boutiques")({
  head: () => ({
    meta: [
      { title: "Boutiques — Admin Boutik" },
      { name: "description", content: "Espace d'administration de la plateforme Boutik." },
      { property: "og:title", content: "Boutiques — Admin Boutik" },
      { property: "og:description", content: "Espace d'administration de la plateforme Boutik." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Shops,
});

type Merchant = Awaited<ReturnType<typeof listMerchants>>["merchants"][number];
type SubInput = { shopId: string; action: "activate" | "deactivate" | "extend_trial"; plan?: PlanId; months?: number; days?: number; amount?: number; method?: string; note?: string };
type Status = "trial" | "active" | "expired";

function statusOf(m: Merchant): Status {
  const now = Date.now();
  if (m.subscription_active && (!m.subscription_ends_at || new Date(m.subscription_ends_at).getTime() > now)) return "active";
  if (new Date(m.trial_ends_at).getTime() > now) return "trial";
  return "expired";
}
const statusUi: Record<Status, { label: string; cls: string }> = {
  trial: { label: "Essai en cours", cls: "bg-warning/25 text-warning-foreground" },
  active: { label: "Actif", cls: "bg-primary-soft text-accent-foreground" },
  expired: { label: "Expiré", cls: "bg-destructive/10 text-destructive" },
};
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function Shops() {
  const list = useServerFn(listMerchants);
  const data = useQuery({ queryKey: ["sa-merchants"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [edit, setEdit] = useState<Merchant | null>(null);

  const merchants = data.data?.merchants ?? [];
  const counts = { trial: 0, active: 0, expired: 0 } as Record<Status, number>;
  merchants.forEach((m) => counts[statusOf(m)]++);
  const shown = merchants.filter((m) => (filter === "all" || statusOf(m) === filter) && (!q || matches(`${m.name} ${m.email} ${m.shop_name}`, q)));

  const stats = [
    { label: "Boutiques inscrites", value: String(merchants.length), sub: `${data.data?.employeesCount ?? 0} employé(s) en plus`, icon: Store },
    { label: "Abonnements actifs", value: String(counts.active), sub: `${counts.trial} en essai · ${counts.expired} expiré(s)`, icon: CheckCircle2 },
    { label: "Revenus des abonnements", value: money(data.data?.revenue ?? 0), sub: "Total des paiements enregistrés", icon: Wallet, big: true },
  ];

  return (
    <div>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className={`rounded-xl border p-5 ${s.big ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
              <div className="flex items-center justify-between"><p className={`text-sm font-medium ${s.big ? "" : "text-muted-foreground"}`}>{s.label}</p><s.icon className="h-5 w-5 opacity-80" /></div>
              <p className="mt-3 font-display text-2xl font-extrabold tabular">{s.value}</p>
              <p className={`mt-1 text-sm ${s.big ? "opacity-90" : "text-muted-foreground"}`}>{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-sm">
            {([["all", "Tous"], ["trial", "Essai"], ["active", "Actifs"], ["expired", "Expirés"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${filter === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Nom, email, boutique…" className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          {data.isLoading && <p className="p-8 text-center text-muted-foreground">Chargement…</p>}
          {data.error && <p className="p-8 text-center text-destructive">{(data.error as Error).message}</p>}
          {!data.isLoading && shown.length === 0 && <p className="p-8 text-center text-muted-foreground">Aucun commerçant.</p>}
          <ul className="divide-y">
            {shown.map((m) => {
              const st = statusOf(m);
              return (
                <li key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.shop_name}{m.name ? <span className="font-normal text-muted-foreground"> · {m.name}</span> : null}</p>
                    <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Inscrit le {d(m.created_at)} · {st === "active" ? (m.subscription_ends_at ? `actif jusqu'au ${d(m.subscription_ends_at)}` : "actif sans limite") : `essai jusqu'au ${d(m.trial_ends_at)}`}
                      {m.paid_total > 0 && ` · payé ${money(m.paid_total)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusUi[st].cls}`}>{statusUi[st].label}{st === "active" ? ` · ${m.plan === "premium" ? "Premium" : "Standard"}` : ""}</span>
                    <Button size="sm" variant="outline" onClick={() => setEdit(m)}>Gérer</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {(data.data?.payments.length ?? 0) > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-bold">Derniers paiements enregistrés</h2>
            <ul className="mt-3 divide-y text-sm">
              {data.data!.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 py-2">
                  <span className="truncate">{d(p.created_at)} · {merchants.find((m) => m.id === p.shop_id)?.shop_name ?? "—"} · {p.method}{p.note ? ` · ${p.note}` : ""}</span>
                  <span className="shrink-0 font-semibold tabular">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <ManageDialog merchant={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function ManageDialog({ merchant, onClose }: { merchant: Merchant | null; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useServerFn(updateSubscription);
  const [months, setMonths] = useState("1");
  const [amount, setAmount] = useState("3000");
  const [plan, setPlan] = useState<PlanId>("standard");
  const pick = (p: PlanId, m: number) => { setPlan(p); setMonths(String(m)); setAmount(String(PLANS[p].prices[m === 3 ? "quarter" : "month"])); };
  const [method, setMethod] = useState("Mobile Money");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("7");

  const mut = useMutation({
    mutationFn: (input: SubInput) => update({ data: input }),
    onSuccess: () => { toast.success("Abonnement mis à jour"); qc.invalidateQueries({ queryKey: ["sa-merchants"] }); setAmount(""); setNote(""); onClose(); },
    onError: (e: Error) => toast.error(e.message.startsWith("[") ? "Valeurs invalides" : e.message),
  });
  if (!merchant) return null;
  const st = statusOf(merchant);

  return (
    <Dialog open={!!merchant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{merchant.shop_name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{merchant.email} · <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusUi[st].cls}`}>{statusUi[st].label}</span></p>

        <form className="space-y-3 rounded-lg border p-4" onSubmit={(e) => { e.preventDefault(); mut.mutate({ shopId: merchant.id, action: "activate", plan, months: parseInt(months) || 0, amount: Number(amount) || 0, method, note }); }}>
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-primary" /> Activer / renouveler l'abonnement</p>
          <div className="grid grid-cols-2 gap-2">
            {(["standard", "premium"] as const).flatMap((p) => [1, 3].map((m) => (
              <button type="button" key={p + m} onClick={() => pick(p, m)}
                className={`rounded-lg border p-2 text-left text-sm ${plan === p && months === String(m) ? "border-primary bg-primary-soft" : ""}`}>
                <span className="font-semibold">{PLANS[p].name}</span> · {m} mois<br /><span className="text-muted-foreground">{PLANS[p].prices[m === 3 ? "quarter" : "month"].toLocaleString("fr-FR")} FCFA</span>
              </button>
            )))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Durée (mois)</Label><Input type="number" min="0" max="36" value={months} onChange={(e) => setMonths(e.target.value)} /><p className="text-xs text-muted-foreground">0 = sans limite</p></div>
            <div className="space-y-1.5"><Label>Montant reçu (FCFA)</Label><Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Moyen de paiement</Label><Input value={method} onChange={(e) => setMethod(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Référence / note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ID transaction" /></div>
          </div>
          <Button type="submit" className="w-full" disabled={mut.isPending}>Activer</Button>
        </form>

        <form className="space-y-3 rounded-lg border p-4" onSubmit={(e) => { e.preventDefault(); mut.mutate({ shopId: merchant.id, action: "extend_trial", days: parseInt(days) || 7 }); }}>
          <p className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-warning" /> Prolonger l'essai gratuit</p>
          <div className="flex gap-2"><Input type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} /><Button type="submit" variant="outline" disabled={mut.isPending}>+ jours</Button></div>
        </form>

        {st === "active" && (
          <Button variant="ghost" className="w-full text-destructive" disabled={mut.isPending}
            onClick={() => confirm("Désactiver l'abonnement de cette boutique ?") && mut.mutate({ shopId: merchant.id, action: "deactivate" })}>
            <XCircle className="h-4 w-4" /> Désactiver l'abonnement
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
