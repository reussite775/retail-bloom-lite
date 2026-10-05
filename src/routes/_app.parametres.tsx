import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { profileQuery, zonesQuery } from "@/lib/data";
import { hasPremium } from "@/lib/plans";

export const Route = createFileRoute("/_app/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres de la boutique — GestiPro" },
      { name: "description", content: "Nom, slogan, contact, adresse et logo affichés sur vos reçus." },
      { property: "og:title", content: "Paramètres de la boutique — GestiPro" },
      { property: "og:description", content: "Personnalisez les reçus de votre boutique." },
    ],
  }),
  component: Settings,
});

function resize(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 240 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * s; c.height = img.height * s;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

function Settings() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const qc = useQueryClient();
  const { data: p } = useQuery(profileQuery(uid));
  const [f, setF] = useState({ shop_name: "", slogan: "", contact: "", address: "", logo_url: "" });
  useEffect(() => {
    if (p) setF({ shop_name: p.shop_name, slogan: p.slogan, contact: p.contact, address: p.address, logo_url: p.logo_url });
  }, [p]);

  const save = useMutation({
    mutationFn: async () => {
      if (!f.shop_name.trim()) throw new Error("Le nom de la boutique est obligatoire");
      const { shop_name, ...rest } = f;
      const { error } = await supabase.from("organizations").update({ name: shop_name, ...rest }).eq("id", uid);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Paramètres enregistrés"); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const zones = useQuery(zonesQuery);
  const [zf, setZf] = useState({ name: "", fee: "" });
  const addZone = useMutation({
    mutationFn: async () => {
      const name = zf.name.trim(); const fee = Number(zf.fee);
      if (!name || name.length > 80) throw new Error("Nom de zone invalide");
      if (!(fee >= 0) || zf.fee === "") throw new Error("Tarif invalide");
      const { error } = await supabase.from("delivery_zones").insert({ name, fee });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Zone ajoutée"); setZf({ name: "", fee: "" }); qc.invalidateQueries({ queryKey: ["delivery_zones"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delZone = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("delivery_zones").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delivery_zones"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setMode = useMutation({
    mutationFn: async (mode: "physical" | "online") => {
      const { error } = await supabase.from("organizations").update({ business_mode: mode }).eq("id", uid);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Type d'activité enregistré"); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: Error) => toast.error(e.message),
  });


  const field = (k: keyof typeof f, label: string, ph = "") => (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <Input value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Paramètres de la boutique</h1>
        <p className="text-muted-foreground">Ces informations apparaissent sur vos reçus.</p>
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-lg border bg-muted text-xs text-muted-foreground">
            {f.logo_url ? <img src={f.logo_url} alt="Logo" className="h-full w-full object-contain" /> : "Logo"}
          </div>
          <div className="space-y-2">
            <Input type="file" accept="image/*" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setF({ ...f, logo_url: await resize(file) });
            }} />
            {f.logo_url && <Button variant="link" className="h-auto p-0" onClick={() => setF({ ...f, logo_url: "" })}>Retirer le logo</Button>}
          </div>
        </div>
        {field("shop_name", "Nom de la boutique")}
        {field("slogan", "Slogan", "Ex : La qualité au meilleur prix")}
        {field("contact", "Contact", "Téléphone, email…")}
        {field("address", "Adresse", "Quartier, ville")}
        <Button className="w-full" size="lg" disabled={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button>
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <div>
          <h2 className="text-lg font-bold">Type d'activité</h2>
          <p className="text-sm text-muted-foreground">Le mode Vendeur en ligne ajoute la gestion des commandes et le suivi des livreurs (offre Premium).</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["physical", "Boutique physique", "Caisse + Carnet de dettes classique"],
            ["online", "Vendeur en ligne / E-commerce", "Commandes digitales et suivi des livreurs"],
          ] as const).map(([v, t, d]) => (
            <button key={v} type="button" disabled={setMode.isPending} onClick={() => setMode.mutate(v)}
              className={`rounded-lg border p-4 text-left transition-colors ${p?.business_mode === v ? "border-primary bg-primary-soft" : "hover:bg-muted"}`}>
              <div className="font-semibold">{t}</div>
              <div className="text-sm text-muted-foreground">{d}</div>
            </button>
          ))}
        </div>
        {p?.business_mode === "online" && !hasPremium(p) && (
          <p className="rounded-lg bg-warning/20 p-3 text-sm">Le module Commandes en ligne nécessite l'offre Premium. Passez à Premium depuis la page Abonnement.</p>
        )}
      </div>
      {p?.business_mode === "online" && (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <div>
            <h2 className="text-lg font-bold">Zones de livraison</h2>
            <p className="text-sm text-muted-foreground">Le tarif de la zone choisie s'ajoute automatiquement au total de la commande.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="flex-1" placeholder="Zone (ex : Cotonou)" value={zf.name} onChange={(e) => setZf({ ...zf, name: e.target.value })} />
            <Input className="w-36" type="number" min={0} placeholder="Tarif FCFA" value={zf.fee} onChange={(e) => setZf({ ...zf, fee: e.target.value })} />
            <Button disabled={addZone.isPending} onClick={() => addZone.mutate()}>Ajouter</Button>
          </div>
          {(zones.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Aucune zone pour l'instant.</p>}
          {(zones.data ?? []).map((z) => (
            <div key={z.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span className="font-medium">{z.name}</span>
              <span className="flex items-center gap-3">{Math.round(Number(z.fee)).toLocaleString("fr-FR")} FCFA
                <button className="text-muted-foreground hover:text-destructive" onClick={() => delZone.mutate(z.id)}>Supprimer</button></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
