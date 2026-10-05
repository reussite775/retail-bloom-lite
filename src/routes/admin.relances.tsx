import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateFollowUps } from "@/lib/relances.functions";

export const Route = createFileRoute("/admin/relances")({
  head: () => ({
    meta: [
      { title: "Relances IA — Admin GestiPro" },
      { name: "description", content: "Priorités de relance et messages personnalisés générés par l'IA." },
      { property: "og:title", content: "Relances IA — Admin GestiPro" },
      { property: "og:description", content: "Priorités de relance et messages personnalisés générés par l'IA." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FollowUps,
});

const prio = {
  haute: { label: "Priorité haute", cls: "bg-destructive/10 text-destructive" },
  moyenne: { label: "Priorité moyenne", cls: "bg-warning/25 text-warning-foreground" },
  basse: { label: "Priorité basse", cls: "bg-primary-soft text-accent-foreground" },
};

function FollowUps() {
  const gen = useServerFn(generateFollowUps);
  const run = useMutation({ mutationFn: () => gen(), onError: (e: Error) => toast.error(e.message) });
  const shops = new Map((run.data?.shops ?? []).map((s) => [s.shop_id, s]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold">Relances des commerçants</h1>
          <p className="text-sm text-muted-foreground">L'IA analyse les statuts, échéances et l'activité de chaque boutique, puis propose qui relancer en premier et un message prêt à envoyer.</p>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending} className="shrink-0">
          <Sparkles className="h-4 w-4" /> {run.isPending ? "Analyse en cours…" : run.data ? "Régénérer" : "Générer les relances"}
        </Button>
      </div>
      {run.data && run.data.items.length === 0 && <p className="text-center text-muted-foreground">Aucune boutique à relancer.</p>}
      <ul className="space-y-3">
        {run.data?.items.map((it) => {
          const s = shops.get(it.shop_id);
          const phone = (s?.contact ?? "").replace(/[^\d]/g, "");
          return (
            <li key={it.shop_id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{s?.boutique}{s?.commercant ? <span className="font-normal text-muted-foreground"> · {s.commercant}</span> : null}</p>
                  <p className="text-xs text-muted-foreground">{s?.statut} · échéance {s?.echeance} · {s?.ventes_30j} ventes sur 30 jours</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${prio[it.priority].cls}`}>{prio[it.priority].label}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{it.reason}</p>
              <p className="mt-3 whitespace-pre-line rounded-lg bg-muted p-3 text-sm">{it.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(it.message); toast.success("Message copié"); }}><Copy className="h-4 w-4" /> Copier</Button>
                {phone.length >= 8 && (
                  <Button size="sm" asChild><a href={`https://wa.me/${phone}?text=${encodeURIComponent(it.message)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a></Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
