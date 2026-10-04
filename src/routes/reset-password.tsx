import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — Boutik" },
      { name: "description", content: "Choisissez un nouveau mot de passe pour votre compte Boutik." },
      { property: "og:title", content: "Nouveau mot de passe — Boutik" },
      { property: "og:description", content: "Réinitialisez le mot de passe de votre compte Boutik." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: d }) => { if (d.session) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) { toast.error("6 caractères minimum"); return; }
    if (pw !== pw2) { toast.error("Les mots de passe ne correspondent pas"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Mot de passe modifié");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2 font-display text-xl font-extrabold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Store className="h-5 w-5" /></span>
          Boutik
        </div>
        <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
        {!ready ? (
          <p className="mt-3 text-sm text-muted-foreground">Ouvrez cette page depuis le lien reçu par email. Si le lien a expiré, redemandez-en un depuis la page de connexion.</p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5"><Label htmlFor="pw">Nouveau mot de passe</Label><Input id="pw" type="password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="pw2">Confirmer</Label><Input id="pw2" type="password" minLength={6} required value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>Enregistrer</Button>
          </form>
        )}
      </div>
    </div>
  );
}
