import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { BadgeCheck, Check, Clock, Crown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { startCheckout } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { profileQuery } from "@/lib/data";
import { money } from "@/lib/format";
import { BILLING_LABEL, PLANS, type Billing, type PlanId } from "@/lib/plans";
import { ContactButtons } from "@/components/plan-contact";

export const Route = createFileRoute("/_app/abonnement")({
  head: () => ({
    meta: [
      { title: "Abonnement — GestiPro" },
      { name: "description", content: "Offres Standard et Premium de GestiPro : caisse, stocks, crédits, multi-utilisateurs et statistiques." },
      { property: "og:title", content: "Abonnement — GestiPro" },
      { property: "og:description", content: "Choisissez l'offre Standard ou Premium de GestiPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Subscription,
});

function Subscription() {
  const { session } = useAuth();
  const { data: p } = useQuery(profileQuery(session!.user.id));
  const email = session!.user.email ?? "";
  const [billing, setBilling] = useState<Billing>("month");
  const [chosen, setChosen] = useState<PlanId | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const qc = useQueryClient();
  const checkout = useServerFn(startCheckout);
  const pay = useMutation({
    mutationFn: () => checkout({ data: { plan: chosen!, billing } }),
    onSuccess: (r) => {
      if (r.paymentUrl) { window.location.href = r.paymentUrl; return; }
      setPending(r.checkoutId);
      toast.info("Demande de paiement enregistrée");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // Back from BkaPay: keep refreshing until the webhook activates the subscription.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("checkout");
    if (!id) return;
    if (q.get("cancelled")) toast.info("Paiement annulé. Vous pouvez réessayer.");
    else { setPending(id); toast.info("Paiement en cours de confirmation…"); }
  }, []);
  // While a payment is pending, refresh the shop status so activation shows up automatically.
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => qc.invalidateQueries({ queryKey: profileQuery(session!.user.id).queryKey }), 5000);
    return () => clearInterval(t);
  }, [pending, qc, session]);
  const now = Date.now();
  const active = !!p?.subscription_active && (!p.subscription_ends_at || new Date(p.subscription_ends_at).getTime() > now);
  const daysLeft = p ? Math.ceil((new Date(p.trial_ends_at).getTime() - now) / 86400000) : 0;
  const currentPlan = active ? (p?.plan === "premium" ? "premium" : "standard") : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Abonnement</h1>
        <p className="text-muted-foreground">Choisissez la formule adaptée à votre boutique.</p>
      </div>

      {active ? (
        <div className="flex items-center gap-3 rounded-xl border bg-primary-soft p-4 font-semibold text-accent-foreground">
          <BadgeCheck className="h-6 w-6 shrink-0 text-primary" />
          Offre {PLANS[currentPlan!].name} active{p?.subscription_ends_at ? ` jusqu'au ${new Date(p.subscription_ends_at).toLocaleDateString("fr-FR")}` : ""}. Merci !
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Clock className="h-6 w-6 shrink-0 text-primary" />
          <p className="font-medium">
            {daysLeft > 0
              ? `Essai gratuit : ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""} — accès à toutes les fonctionnalités.`
              : "Votre essai gratuit de 7 jours est terminé. Choisissez une offre pour continuer."}
          </p>
        </div>
      )}

      <div className="flex justify-center">
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(["month", "quarter"] as const).map((b) => (
            <button key={b} onClick={() => setBilling(b)} className={`rounded-md px-4 py-2 font-medium ${billing === b ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {b === "month" ? "Mensuel" : "3 mois"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(["standard", "premium"] as const).map((id) => {
          const plan = PLANS[id];
          const premium = id === "premium";
          const isCurrent = currentPlan === id;
          return (
            <div key={id} className={`relative flex flex-col rounded-2xl border bg-card p-6 ${premium ? "border-primary ring-1 ring-primary" : ""} ${chosen === id ? "ring-2 ring-primary" : ""}`}>
              {premium && <span className="absolute -top-3 left-6 flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"><Sparkles className="h-3 w-3" /> Le plus complet</span>}
              <p className="flex items-center gap-2 text-lg font-bold">{premium && <Crown className="h-5 w-5 text-primary" />} {plan.name}</p>
              <p className="mt-2 font-display text-3xl font-extrabold tabular">{money(plan.prices[billing])}</p>
              <p className="text-sm text-muted-foreground">pour {BILLING_LABEL[billing]}{billing === "quarter" ? ` · soit ${money(Math.round(plan.prices.quarter / 3))} / mois` : ` · ou ${money(plan.prices.quarter)} pour 3 mois`}</p>
              {plan.extraTitle && <p className="mt-5 text-sm font-semibold">{plan.extraTitle}</p>}
              <ul className={`${plan.extraTitle ? "mt-2" : "mt-5"} flex-1 space-y-2.5`}>
                {plan.perks.map((x) => (
                  <li key={x} className="flex items-start gap-2.5"><Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> {x}</li>
                ))}
              </ul>
              <Button className="mt-6 h-12 w-full text-base" variant={premium ? "default" : "outline"} disabled={isCurrent} onClick={() => setChosen(id)}>
                {isCurrent ? "Votre offre actuelle" : chosen === id ? "Offre sélectionnée" : `Choisir ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>

      {chosen && (
        <div className="space-y-3 rounded-2xl border bg-card p-6">
          <p className="font-bold">Offre {PLANS[chosen].name} · {BILLING_LABEL[billing]} · {money(PLANS[chosen].prices[billing])}</p>
          {pending ? (
            <div className="flex items-center gap-3 rounded-xl bg-muted p-4 text-sm">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
              Paiement en attente de validation. Votre abonnement s'activera automatiquement dès confirmation.
            </div>
          ) : (
            <Button className="h-12 w-full text-base" disabled={pay.isPending} onClick={() => pay.mutate()}>
              {pay.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : `Payer ${money(PLANS[chosen].prices[billing])}`}
            </Button>
          )}
          <p className="text-sm text-muted-foreground">Le paiement en ligne arrive bientôt. En attendant, payez par Mobile Money puis contactez-nous : votre abonnement est activé dès validation.</p>
          <ContactButtons email={email} choice={`offre ${PLANS[chosen].name}, ${BILLING_LABEL[billing]} (${PLANS[chosen].prices[billing].toLocaleString("fr-FR")} FCFA)`} />
        </div>
      )}
    </div>
  );
}
