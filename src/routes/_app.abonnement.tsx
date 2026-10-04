import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Check, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { profileQuery } from "@/lib/data";
import { ContactButtons, PlanPrice } from "@/components/plan-contact";

export const Route = createFileRoute("/_app/abonnement")({
  head: () => ({
    meta: [
      { title: "Abonnement — Boutik" },
      { name: "description", content: "Activez votre abonnement Boutik pour continuer à gérer votre boutique." },
      { property: "og:title", content: "Abonnement — Boutik" },
      { property: "og:description", content: "Les avantages de l'abonnement Boutik." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Subscription,
});

const perks = [
  "Caisse rapide et reçus personnalisés illimités",
  "Gestion des produits et des stocks",
  "Carnet de crédits clients et remboursements",
  "Tableau de bord : chiffre d'affaires et bénéfices",
  "Vos données sauvegardées en sécurité",
  "Assistance par téléphone et WhatsApp",
];

function Subscription() {
  const { session } = useAuth();
  const { data: p } = useQuery(profileQuery(session!.user.id));
  const email = session!.user.email ?? "";
  const daysLeft = p ? Math.ceil((new Date(p.trial_ends_at).getTime() - Date.now()) / 86400000) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Abonnement</h1>
        <p className="text-muted-foreground">Tout ce qu'il faut pour gérer votre boutique au quotidien.</p>
      </div>

      {p?.subscription_active ? (
        <div className="flex items-center gap-3 rounded-xl border bg-primary-soft p-4 font-semibold text-accent-foreground">
          <BadgeCheck className="h-6 w-6 text-primary" /> Votre abonnement est actif. Merci !
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Clock className="h-6 w-6 text-primary" />
          <p className="font-medium">
            {daysLeft > 0
              ? `Essai gratuit : ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}`
              : "Votre essai gratuit est terminé."}
          </p>
        </div>
      )}

      <div className="rounded-2xl border bg-card p-6 md:p-8">
        <p className="text-sm text-muted-foreground">Abonnement Boutik</p>
        <PlanPrice className="font-display text-3xl font-extrabold" />
        <ul className="mt-6 space-y-3">
          {perks.map((x) => (
            <li key={x} className="flex items-start gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> {x}</li>
          ))}
        </ul>
        {!p?.subscription_active && (
          <div className="mt-8"><ContactButtons email={email} /></div>
        )}
        <p className="mt-3 text-center text-xs text-muted-foreground">Votre abonnement est activé dès réception du paiement.</p>
      </div>
    </div>
  );
}
