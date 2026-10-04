import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Gift, MessageCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { profileQuery } from "@/lib/data";

export const Route = createFileRoute("/_app/parrainage")({
  head: () => ({
    meta: [
      { title: "Parrainage — Boutik" },
      { name: "description", content: "Invitez d'autres commerçants sur Boutik et gagnez un mois offert pour chaque filleul abonné." },
      { property: "og:title", content: "Parrainage — Boutik" },
      { property: "og:description", content: "Partagez votre lien de parrainage Boutik et suivez vos filleuls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Referral,
});

const STATUS = {
  active: { label: "Actif", cls: "bg-primary text-primary-foreground" },
  trial: { label: "Essai", cls: "bg-primary-soft text-accent-foreground" },
  expired: { label: "Expiré", cls: "bg-muted text-muted-foreground" },
} as const;

// Invitation links must point at the public app, never at the private editor preview.
const PUBLIC_URL = "https://project--bb68070d-c399-447e-81aa-52bb414648db.lovable.app";
function publicOrigin() {
  const h = window.location.hostname;
  const internal = h === "localhost" || h.startsWith("id-preview--") || h.startsWith("preview--") || h.endsWith("-dev.lovable.app") || h.endsWith("lovableproject.com") || h.endsWith("lovableproject-dev.com");
  return internal ? PUBLIC_URL : window.location.origin;
}

function Referral() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const { data: p } = useQuery(profileQuery(uid));
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(publicOrigin()), []);
  const code = p?.referral_code ?? "";
  const link = code && origin ? `${origin}/auth?ref=${code}` : "";

  const refs = useQuery({
    queryKey: ["my_referrals"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_referrals");
      if (error) throw error;
      return data;
    },
  });
  const list = refs.data ?? [];
  const months = list.reduce((a, r) => a + (r.reward_months ?? 0), 0);
  const message = `Je gère ma boutique avec Boutik (caisse, stocks, crédits, commandes en ligne). Essaie-le gratuitement 7 jours avec mon lien : ${link}`;

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copié`); } catch { toast.error("Copie impossible"); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Parrainage</h1>
        <p className="text-muted-foreground">Invitez d'autres commerçants. Pour chaque filleul qui prend un abonnement payant, vous gagnez <strong>1 mois offert</strong>.</p>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <div className="text-sm font-medium">Votre lien de parrainage</div>
        <div className="flex gap-2">
          <Input readOnly value={link} className="font-mono text-sm" />
          <Button variant="outline" onClick={() => copy(link, "Lien")} disabled={!link}><Copy className="h-4 w-4" /> Copier</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Code :</span>
          <button onClick={() => copy(code, "Code")} className="rounded-md bg-primary-soft px-3 py-1 font-mono text-lg font-bold tracking-widest text-accent-foreground">{code || "…"}</button>
          <Button asChild disabled={!link}>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Partager sur WhatsApp</a>
          </Button>
          <Button variant="outline" onClick={() => copy(message, "Message")} disabled={!link}>Copier le message</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Filleuls inscrits" value={String(list.length)} />
        <Stat icon={Users} label="Filleuls abonnés" value={String(list.filter((r) => r.status === "active").length)} />
        <Stat icon={Gift} label="Mois offerts gagnés" value={String(months)} />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b p-4 font-semibold">Mes filleuls</div>
        {list.length === 0 && <p className="p-6 text-center text-muted-foreground">Aucun filleul pour l'instant. Partagez votre lien !</p>}
        {list.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b p-4 last:border-0">
            <div>
              <div className="font-medium">{r.shop_name}</div>
              <div className="text-xs text-muted-foreground">Inscrit le {new Date(r.joined_at).toLocaleDateString("fr-FR")}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status as keyof typeof STATUS]?.cls ?? ""}`}>{STATUS[r.status as keyof typeof STATUS]?.label ?? r.status}</span>
              {r.rewarded_at
                ? <span className="text-xs font-medium text-primary">+{r.reward_months} mois offert</span>
                : <span className="text-xs text-muted-foreground">Récompense à l'abonnement</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Gift; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" /> {label}</div>
      <div className="font-display text-2xl font-extrabold">{value}</div>
    </div>
  );
}
