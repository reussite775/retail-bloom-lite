import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { ArrowLeft, BarChart3, Crown, LayoutDashboard, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { checkSuperAdmin } from "@/lib/superadmin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administration — Boutik" },
      { name: "description", content: "Espace d'administration de la plateforme Boutik." },
      { property: "og:title", content: "Administration — Boutik" },
      { property: "og:description", content: "Espace d'administration de la plateforme Boutik." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  ssr: false,
  component: AdminLayout,
});

const tabs = [
  { to: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
  { to: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, exact: false },
  { to: "/admin/statistiques", label: "Statistiques", icon: BarChart3, exact: false },
  { to: "/admin/boutiques", label: "Boutiques & abonnements", icon: Store, exact: false },
] as const;

function AdminLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const check = useServerFn(checkSuperAdmin);
  const access = useQuery({ queryKey: ["sa-check", session?.user.id], enabled: !!session, queryFn: () => check() });

  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);

  if (loading || !session || access.isLoading) return <div className="grid min-h-screen place-items-center text-muted-foreground">Chargement…</div>;
  if (access.data?.isSuperAdmin !== true) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div><p className="text-2xl font-bold">Accès refusé</p><p className="mt-2 text-muted-foreground">Cette page est réservée à l'administrateur de la plateforme.</p>
          <Button asChild className="mt-6"><Link to="/dashboard">Retour</Link></Button></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-2 font-display text-lg font-extrabold text-sidebar-accent-foreground"><Crown className="h-5 w-5 text-sidebar-primary" /> Administration</div>
          <Link to="/dashboard" className="flex items-center gap-1 text-sm hover:text-sidebar-accent-foreground"><ArrowLeft className="h-4 w-4" /> Ma boutique</Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2">
          {tabs.map((t) => (
            <Link key={t.to} to={t.to} activeOptions={{ exact: t.exact }}
              className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>
              <t.icon className="h-4 w-4" /> {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-8"><Outlet /></main>
    </div>
  );
}
