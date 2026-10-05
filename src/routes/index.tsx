import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BarChart3, Boxes, ShoppingCart, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GestiPro — La gestion simple pour commerçants" },
      { name: "description", content: "Caisse, stocks et chiffre d'affaires du jour. Essai gratuit 7 jours." },
      { property: "og:title", content: "GestiPro — La gestion simple pour commerçants" },
      { property: "og:description", content: "Caisse, stocks et chiffre d'affaires du jour. Essai gratuit 7 jours." },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: BarChart3, title: "Tableau de bord", text: "Votre chiffre d'affaires du jour en un coup d'œil." },
  { icon: Boxes, title: "Produits & stocks", text: "Prix d'achat, prix de vente, quantités, alertes." },
  { icon: ShoppingCart, title: "Caisse rapide", text: "Encaissez en quelques clics, le stock suit." },
];

function Landing() {
  const { session } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (session) navigate({ to: "/dashboard" });
  }, [session, navigate]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-display text-xl font-extrabold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Store className="h-5 w-5" /></span>
          GestiPro
        </div>
        <Button asChild variant="outline"><Link to="/auth">Se connecter</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <p className="mb-4 inline-block rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-accent-foreground">7 jours d'essai gratuit · sans carte</p>
        <h1 className="max-w-3xl text-5xl font-extrabold leading-tight md:text-6xl">
          Votre boutique, <span className="text-primary">sous contrôle</span>.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Encaissez, suivez vos stocks et connaissez votre chiffre du jour — sans tableur, sans complication.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Commencer l'essai gratuit</Link></Button>
        </div>
        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-1 text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
