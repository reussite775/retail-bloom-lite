import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { profileQuery } from "@/lib/data";

export const Route = createFileRoute("/_app/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres de la boutique — Boutik" },
      { name: "description", content: "Nom, slogan, contact, adresse et logo affichés sur vos reçus." },
      { property: "og:title", content: "Paramètres de la boutique — Boutik" },
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
      const { error } = await supabase.from("profiles").update(f).eq("id", uid);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Paramètres enregistrés"); qc.invalidateQueries({ queryKey: ["profile"] }); },
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
    </div>
  );
}
