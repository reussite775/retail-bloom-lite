import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { platformSettingsQuery } from "@/components/plan-contact";
import { updatePlatformSettings } from "@/lib/superadmin.functions";

export const Route = createFileRoute("/admin/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres — Admin Boutik" },
      { name: "description", content: "Tarif d'abonnement et coordonnées de contact de la plateforme." },
      { property: "og:title", content: "Paramètres — Admin Boutik" },
      { property: "og:description", content: "Tarif d'abonnement et coordonnées de contact de la plateforme." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PlatformSettings,
});

function PlatformSettings() {
  const qc = useQueryClient();
  const save = useServerFn(updatePlatformSettings);
  const { data } = useQuery(platformSettingsQuery);
  const [f, setF] = useState({ contact_email: "", contact_whatsapp: "", payment_instructions: "" });
  useEffect(() => {
    if (data) setF({ contact_email: data.contact_email, contact_whatsapp: data.contact_whatsapp, payment_instructions: data.payment_instructions });
  }, [data]);
  const m = useMutation({
    mutationFn: () => save({ data: f }),
    onSuccess: () => { toast.success("Paramètres enregistrés"); qc.invalidateQueries({ queryKey: ["platform-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form className="max-w-xl space-y-5 rounded-xl border bg-card p-6" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div>
        <h1 className="font-bold">Contact pour les abonnements</h1>
        <p className="text-sm text-muted-foreground">Affichés aux commerçants sur l'écran de blocage et la page Abonnement. Les tarifs Standard et Premium sont fixes.</p>
      </div>
      <div className="space-y-1"><Label>Numéro WhatsApp</Label><Input value={f.contact_whatsapp} maxLength={30} placeholder="+229 01 00 00 00 00" onChange={(e) => setF({ ...f, contact_whatsapp: e.target.value })} /></div>
      <div className="space-y-1"><Label>Email de contact</Label><Input type="email" value={f.contact_email} maxLength={255} onChange={(e) => setF({ ...f, contact_email: e.target.value })} /></div>
      <div className="space-y-1"><Label>Instructions de paiement (facultatif)</Label><Textarea rows={3} maxLength={500} value={f.payment_instructions} placeholder="Ex : Envoyez le montant par Mobile Money au …, puis contactez-nous." onChange={(e) => setF({ ...f, payment_instructions: e.target.value })} /></div>
      <Button type="submit" disabled={m.isPending}>Enregistrer</Button>
    </form>
  );
}
