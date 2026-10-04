import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { BarChart3, BookUser, Receipt, Boxes, Crown, CloudOff, History, RefreshCw, UserCog, Clock, CreditCard, Lock, LogOut, Settings, ShoppingCart, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ContactButtons, PlanPrice } from "@/components/plan-contact";
import { useOnline, usePendingSales } from "@/lib/offline";
import { membershipQuery, profileQuery } from "@/lib/data";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "Tableau de bord", icon: BarChart3, admin: true },
  { to: "/caisse", label: "Caisse", icon: ShoppingCart, admin: false },
  { to: "/ventes", label: "Historique des ventes", icon: History, admin: true },
  { to: "/produits", label: "Produits & stocks", icon: Boxes, admin: true },
  { to: "/credits", label: "Carnet de crédits", icon: BookUser, admin: false },
  { to: "/depenses", label: "Dépenses", icon: Receipt, admin: true },
  { to: "/abonnement", label: "Abonnement", icon: CreditCard, admin: true },
  { to: "/parametres", label: "Paramètres", icon: Settings, admin: true },
  { to: "/equipe", label: "Équipe & accès", icon: UserCog, admin: true },
] as const;

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });
  const uid = session?.user.id;
  const member = useQuery({ ...membershipQuery(uid ?? ""), enabled: !!uid });
  const shopId = member.data?.shopId;
  const isAdmin = member.data?.isAdmin ?? false;
  const profile = useQuery({ ...profileQuery(shopId ?? ""), enabled: !!shopId });
  const superAdmin = useQuery({
    queryKey: ["super-admin", uid],
    enabled: !!uid,
    queryFn: async () => (await supabase.from("user_roles").select("role").eq("user_id", uid!).eq("role", "super_admin")).data?.length === 1,
  });
  const online = useOnline();
  const pending = usePendingSales();
  const allowed = nav.filter((n) => isAdmin || !n.admin);
  const forbidden = !!member.data && !isAdmin && !allowed.some((n) => pathname.startsWith(n.to));

  useEffect(() => {
    if (forbidden) navigate({ to: "/caisse", replace: true });
  }, [forbidden, navigate]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session || member.isLoading || profile.isLoading || forbidden) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Chargement…</div>;
  }

  const p = profile.data;
  const trialEnd = p ? new Date(p.trial_ends_at) : new Date(0);
  const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / 86400000);
  const subActive = !!p && p.subscription_active && (!p.subscription_ends_at || new Date(p.subscription_ends_at).getTime() > Date.now());
  const hasAccess = !!p && (subActive || daysLeft > 0);

  if (!hasAccess && (!isAdmin || pathname !== "/abonnement")) return <Paywall isAdmin={isAdmin} />;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex">
        <div className="mb-8 flex items-center gap-2 px-2 pt-2 font-display text-xl font-extrabold text-sidebar-accent-foreground">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Store className="h-5 w-5" /></span>
          Boutik
        </div>
        <nav className="space-y-1">
          {allowed.map((n) => (
            <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>
              <n.icon className="h-5 w-5" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          {isAdmin && !subActive && (
            <div className="rounded-lg border border-sidebar-border p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-sidebar-accent-foreground"><Clock className="h-4 w-4 text-sidebar-primary" /> Essai gratuit</div>
              <p className="mt-1">{daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}</p>
            </div>
          )}
          {superAdmin.data && (
            <Link to="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-sidebar-primary hover:bg-sidebar-accent"><Crown className="h-4 w-4" /> Super Admin</Link>
          )}
          <div className="truncate px-3 text-xs opacity-70">{session.user.email} · {isAdmin ? "Administrateur" : "Caissier"}</div>
          <button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {isAdmin && !subActive && (
          <Link to="/abonnement" className="flex items-center justify-center gap-2 bg-primary-soft px-3 py-2 text-sm font-medium text-accent-foreground md:hidden">
            <Clock className="h-4 w-4" /> {daysLeft > 0 ? `Essai gratuit : ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}` : "Essai terminé — s'abonner"}
          </Link>
        )}
        <nav className="flex gap-1 overflow-x-auto border-b bg-card p-2 md:hidden">
          {allowed.map((n) => (
            <Link key={n.to} to={n.to} className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium"
              activeProps={{ className: "bg-primary-soft text-accent-foreground" }}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
          {superAdmin.data && (
            <Link to="/admin" className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold text-primary"><Crown className="h-4 w-4" /> Super Admin</Link>
          )}
        </nav>
        {(!online || pending.length > 0) && (
          <div className={`flex items-center justify-center gap-2 px-3 py-2 text-center text-sm font-medium ${online ? "bg-primary-soft text-accent-foreground" : "bg-warning/25 text-warning-foreground"}`}>
            {online ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudOff className="h-4 w-4" />}
            {online
              ? `Envoi de ${pending.length} vente(s) enregistrée(s) hors ligne…`
              : `Hors ligne — les ventes sont enregistrées sur l'appareil${pending.length ? ` (${pending.length} en attente)` : ""} et envoyées au retour du réseau.`}
          </div>
        )}
        <main className="flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}

function Paywall({ isAdmin }: { isAdmin: boolean }) {
  const { session } = useAuth();
  const email = session?.user.email ?? "";
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary"><Lock className="h-7 w-7" /></div>
        <h1 className="mt-5 text-2xl font-bold">Votre essai gratuit est terminé</h1>
        <p className="mt-2 text-muted-foreground">
          Vos 7 jours d'essai sont écoulés. La caisse, les stocks et le carnet de crédits sont bloqués. Vos données sont conservées — abonnez-vous pour continuer.
        </p>
        {isAdmin ? (
          <div className="mt-6 space-y-3">
            <PlanPrice className="font-display text-2xl font-extrabold" />
            <ContactButtons email={email} />
            <Link to="/abonnement" className="block text-sm font-medium text-primary hover:underline">Voir les avantages de l'abonnement</Link>
          </div>
        ) : (
          <p className="mt-6 rounded-lg bg-muted p-3 text-sm font-medium">Demandez au propriétaire de la boutique de renouveler l'abonnement.</p>
        )}
        <button onClick={() => supabase.auth.signOut()} className="mt-4 text-sm text-muted-foreground hover:text-foreground">Se déconnecter</button>
      </div>
    </div>
  );
}
