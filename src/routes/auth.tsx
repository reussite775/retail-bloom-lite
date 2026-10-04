import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Boutik" },
      { name: "description", content: "Connectez-vous ou créez votre compte Boutik." },
      { property: "og:title", content: "Connexion — Boutik" },
      { property: "og:description", content: "Connectez-vous ou créez votre compte Boutik." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { session } = useAuth();
  const navigate = useNavigate();

  const [refCode, setRefCode] = useState("");
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase().slice(0, 16);
    if (ref && /^[A-Z0-9]+$/.test(ref)) { localStorage.setItem("boutik_ref", ref); setRefCode(ref); setMode("up"); }
  }, []);

  const invited = !!refCode;
  useEffect(() => {
    // An invitation link opened by someone already signed in must not jump into that account.
    if (session && !new URLSearchParams(window.location.search).get("ref")) navigate({ to: "/dashboard" });
  }, [session, navigate]);
  const switchAccount = async () => { await supabase.auth.signOut(); toast.success("Vous pouvez créer votre compte."); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error("Email ou mot de passe incorrect");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) toast.error(error.message);
      else if (!data.session) toast.success("Vérifiez votre email pour confirmer votre compte.");
    }
    setBusy(false);
  };

  const forgot = async () => {
    if (!email) { toast.error("Saisissez d'abord votre email"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) toast.error(error.message);
    else toast.success("Si un compte existe, un email de réinitialisation vient d'être envoyé.");
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Connexion Google impossible");
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2 font-display text-xl font-extrabold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Store className="h-5 w-5" /></span>
          Boutik
        </div>
        <h1 className="text-2xl font-bold">{mode === "in" ? "Bon retour" : "Créer un compte"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "in" ? "Connectez-vous à votre boutique." : "7 jours d'essai gratuit, sans engagement."}
        </p>
        {invited && <p className="mt-3 rounded-lg bg-primary-soft p-2 text-sm text-accent-foreground">Vous êtes invité par un commerçant Boutik (code de parrainage {refCode}).</p>}
        {invited && session && (
          <div className="mt-3 rounded-lg border p-3 text-sm">
            Vous êtes déjà connecté avec {session.user.email}. Pour créer une nouvelle boutique avec cette invitation, déconnectez-vous d'abord.
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={switchAccount}>Se déconnecter</Button>
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>Aller à ma boutique</Button>
            </div>
          </div>
        )}
        <Button variant="outline" className="mt-6 w-full" onClick={google}>Continuer avec Google</Button>
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />ou<div className="h-px flex-1 bg-border" /></div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pw">Mot de passe</Label><Input id="pw" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {mode === "in" && <button type="button" onClick={forgot} className="-mt-2 text-sm text-primary hover:underline">Mot de passe oublié ?</button>}
          <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Se connecter" : "Démarrer l'essai"}</Button>
        </form>
        <button className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Pas de compte ? Essai gratuit" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}
