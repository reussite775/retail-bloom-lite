import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { BarChart3, BookUser, Receipt, Boxes, Crown, CloudOff, History, RefreshCw, UserCog, Clock, CreditCard, Lock, LogOut, Settings, ShoppingCart, Store , Lightbulb, Truck, Gift, Menu, Globe, Home, FileText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ContactButtons, PlanPrice } from "@/components/plan-contact";
import { useOnline, usePendingSales } from "@/lib/offline";
import { membershipQuery, profileQuery } from "@/lib/data";
import { hasPremium } from "@/lib/plans";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "Tableau de bord", icon: BarChart3, admin: true },
  { to: "/caisse", label: "Caisse", icon: ShoppingCart, admin: false },
  { to: "/ventes", label: "Historique des ventes", icon: History, admin: true },
  { to: "/produits", label: "Produits & stocks", icon: Boxes, admin: true },
  { to: "/credits", label: "Carnet de crédits", icon: BookUser, admin: false },
  { to: "/commandes", label: "Commandes en ligne", icon: Truck, admin: false, online: true },
  { to: "/depenses", label: "Dépenses", icon: Receipt, admin: true },
  { to: "/assistant", label: "Conseiller IA", icon: Lightbulb, admin: true },
  { to: "/abonnement", label: "Abonnement", icon: CreditCard, admin: true },
  { to: "/parametres", label: "Paramètres", icon: Settings, admin: true },
  { to: "/equipe", label: "Équipe & accès", icon: UserCog, admin: true },
  { to: "/parrainage", label: "Parrainage", icon: Gift, admin: true },
] as const;

// Digital creator space: separate navigation, no physical-commerce modules.
const digitalNav = [
  { to: "/studio", label: "Accueil", icon: Home, admin: false },
  { to: "/studio/produits", label: "Produits", icon: FileText, admin: true },
  { to: "/studio/ventes", label: "Vente", icon: Globe, admin: true },
  { to: "/studio/affilies", label: "Affiliés", icon: Users, admin: true },
  { to: "/abonnement", label: "Abonnement", icon: CreditCard, admin: true },
  { to: "/parametres", label: "Paramètres", icon: Settings, admin: true },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const pending = usePendingSales();
  const digital = profile.data?.account_type === "digital";
  const allowed = digital
    ? digitalNav.filter((n) => isAdmin || !n.admin)
    : nav.filter((n) => (isAdmin || !n.admin) && (!("online" in n) || profile.data?.business_mode === "online"));
  const inStudio = pathname.startsWith("/studio");
  const wrongSpace = !!profile.data && (digital ? !allowed.some((n) => n.to === "/studio" ? pathname.replace(/\/$/, "") === "/studio" : pathname.startsWith(n.to)) : inStudio);
  const forbidden = !!member.data && ((!isAdmin && !allowed.some((n) => n.to === "/studio" ? pathname.replace(/\/$/, "") === "/studio" : pathname.startsWith(n.to))) || wrongSpace);

  useEffect(() => {
    if (forbidden) navigate({ to: digital ? "/studio" : isAdmin ? "/dashboard" : "/caisse", replace: true });
  }, [forbidden, digital, isAdmin, navigate]);


  useEffect(() => {
    const ref = typeof window !== "undefined" ? localStorage.getItem("boutik_ref") : null;
    if (!session || !ref) return;
    supabase.rpc("claim_referral", { _code: ref }).then(() => localStorage.removeItem("boutik_ref"));
  }, [session]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session || member.isLoading || profile.isLoading || superAdmin.isLoading || forbidden) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Chargement…</div>;
  }

  const p = profile.data;
  const trialEnd = p ? new Date(p.trial_ends_at) : new Date(0);
  const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / 86400000);
  const subActive = !!p && p.subscription_active && (!p.subscription_ends_at || new Date(p.subscription_ends_at).getTime() > Date.now());
  const hasAccess = !!p && (subActive || daysLeft > 0);

  if (p && shopId === uid && !p.space_chosen_at) return <WelcomeChoice uid={uid!} />;
  if (!isAdmin && !hasPremium(p)) return <CashierPremiumWall />;
  if (!superAdmin.data && !hasAccess && (!isAdmin || pathname !== "/abonnement")) return <Paywall isAdmin={isAdmin} />;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex">
        <div className="mb-8 flex items-center gap-2 px-2 pt-2 font-display text-xl font-extrabold text-sidebar-accent-foreground">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Store className="h-5 w-5" /></span>
          GestiPro
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
        <div className="flex items-center gap-3 border-b bg-card px-3 py-2 md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button aria-label="Ouvrir le menu" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted"><Menu className="h-6 w-6" /></button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto p-4">
              <SheetTitle className="mb-4 flex items-center gap-2 font-display text-xl font-extrabold">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Store className="h-5 w-5" /></span>
                GestiPro
              </SheetTitle>
              <nav className="space-y-1">
                {allowed.map((n) => (
                  <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium hover:bg-muted"
                    activeProps={{ className: "bg-primary-soft text-accent-foreground" }}>
                    <n.icon className="h-5 w-5" /> {n.label}
                  </Link>
                ))}
                {superAdmin.data && (
                  <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-semibold text-primary"><Crown className="h-5 w-5" /> Super Admin</Link>
                )}
              </nav>
              <div className="mt-6 border-t pt-4">
                <div className="truncate px-3 text-xs text-muted-foreground">{session.user.email} · {isAdmin ? "Administrateur" : "Caissier"}</div>
                <button onClick={() => supabase.auth.signOut()} className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-base hover:bg-muted">
                  <LogOut className="h-5 w-5" /> Déconnexion
                </button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-display text-lg font-extrabold">GestiPro</span>
        </div>
        {(!online || pending.length > 0) && (
          <div className={`flex items-center justify-center gap-2 px-3 py-2 text-center text-sm font-medium ${online ? "bg-primary-soft text-accent-foreground" : "bg-warning/25 text-warning-foreground"}`}>
            {online ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudOff className="h-4 w-4" />}
            {online
              ? `Synchronisation de ${pending.length} opération(s) enregistrée(s) hors ligne…`
              : `Hors ligne — ventes, stock et dettes sont enregistrés sur l'appareil${pending.length ? ` (${pending.length} en attente)` : ""} et envoyées au retour du réseau.`}
          </div>
        )}
        <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full border bg-card/90 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-primary" : "bg-warning"}`} />
          {online ? "En ligne" : "Hors ligne"}
        </div>
        <main className="flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}

function WelcomeChoice({ uid }: { uid: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const choose = async (t: "physical" | "digital") => {
    setBusy(t);
    const { error } = await supabase.from("organizations")
      .update({ account_type: t, space_chosen_at: new Date().toISOString() }).eq("id", uid);
    if (error) { setBusy(null); toast.error("Impossible d'enregistrer votre choix. Réessayez."); return; }
    await qc.invalidateQueries({ queryKey: ["profile", uid] });
    navigate({ to: t === "digital" ? "/studio" : "/dashboard", replace: true });
  };
  const cards = [
    { t: "physical" as const, icon: Store, title: "Commerçant physique", desc: "Caisse, ventes, produits et stocks, carnet de crédits et dépenses." },
    { t: "digital" as const, icon: Globe, title: "Créateur numérique", desc: "Produits numériques, ventes et affiliation." },
  ];
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-3xl text-center">
        <h1 className="font-display text-3xl font-extrabold">Bienvenue dans GestiPro !</h1>
        <p className="mt-2 text-lg text-muted-foreground">Quelle activité souhaitez-vous gérer ?</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {cards.map((c) => (
            <div key={c.t} className="flex flex-col rounded-2xl border bg-card p-6 text-left shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary"><c.icon className="h-6 w-6" /></span>
              <h2 className="mt-4 text-xl font-bold">{c.title}</h2>
              <p className="mt-1 flex-1 text-muted-foreground">{c.desc}</p>
              <Button className="mt-6" disabled={!!busy} onClick={() => choose(c.t)}>
                {busy === c.t ? "Enregistrement…" : "Continuer"}
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Vous pourrez changer d'espace plus tard dans Paramètres.</p>
      </div>
    </div>
  );
}

function CashierPremiumWall() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary"><Crown className="h-7 w-7" /></div>
        <h1 className="mt-5 text-2xl font-bold">Boutique en attente de Premium</h1>
        <p className="mt-2 text-muted-foreground">
          Les comptes caissiers sont réservés à l'offre Premium. Votre accès à la caisse et au carnet de crédits reprendra dès que la boutique sera passée à Premium.
        </p>
        <p className="mt-6 rounded-lg bg-muted p-3 text-sm font-medium">Demandez au propriétaire de la boutique de souscrire à l'offre Premium.</p>
        <button onClick={() => supabase.auth.signOut()} className="mt-4 text-sm text-muted-foreground hover:text-foreground">Se déconnecter</button>
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
