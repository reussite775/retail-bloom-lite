import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { BarChart3, BookUser, Boxes, Clock, Lock, LogOut, Settings, ShoppingCart, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { profileQuery } from "@/lib/data";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "Tableau de bord", icon: BarChart3 },
  { to: "/caisse", label: "Caisse", icon: ShoppingCart },
  { to: "/produits", label: "Produits & stocks", icon: Boxes },
  { to: "/credits", label: "Carnet de crédits", icon: BookUser },
  { to: "/parametres", label: "Paramètres", icon: Settings },
] as const;

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const uid = session?.user.id;
  const profile = useQuery({ ...profileQuery(uid ?? ""), enabled: !!uid });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session || profile.isLoading) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Chargement…</div>;
  }

  const p = profile.data;
  const trialEnd = p ? new Date(p.trial_ends_at) : new Date(0);
  const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / 86400000);
  const hasAccess = !!p && (p.subscription_active || daysLeft > 0);

  if (!hasAccess) return <Paywall email={session.user.email ?? ""} />;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex">
        <div className="mb-8 flex items-center gap-2 px-2 pt-2 font-display text-xl font-extrabold text-sidebar-accent-foreground">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Store className="h-5 w-5" /></span>
          Boutik
        </div>
        <nav className="space-y-1">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>
              <n.icon className="h-5 w-5" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          {!p!.subscription_active && (
            <div className="rounded-lg border border-sidebar-border p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-sidebar-accent-foreground"><Clock className="h-4 w-4 text-sidebar-primary" /> Essai gratuit</div>
              <p className="mt-1">{daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}</p>
            </div>
          )}
          <button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b bg-card p-2 md:hidden">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium"
              activeProps={{ className: "bg-primary-soft text-accent-foreground" }}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}

function Paywall({ email }: { email: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary"><Lock className="h-7 w-7" /></div>
        <h1 className="mt-5 text-2xl font-bold">Votre essai gratuit est terminé</h1>
        <p className="mt-2 text-muted-foreground">
          Vos 7 jours d'essai sont écoulés. Vos produits et ventes sont conservés — activez votre abonnement pour continuer à utiliser Boutik.
        </p>
        <div className="mt-6 rounded-xl bg-muted p-4">
          <p className="text-sm text-muted-foreground">Abonnement mensuel</p>
          <p className="font-display text-3xl font-extrabold">Contactez-nous</p>
        </div>
        <Button asChild className="mt-6 w-full" size="lg">
          <a href={`mailto:contact@boutik.app?subject=Activation abonnement&body=Compte : ${email}`}>Activer mon abonnement</a>
        </Button>
        <button onClick={() => supabase.auth.signOut()} className="mt-4 text-sm text-muted-foreground hover:text-foreground">Se déconnecter</button>
      </div>
    </div>
  );
}
