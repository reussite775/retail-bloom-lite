import { queryOptions, useQuery } from "@tanstack/react-query";
import { Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/format";

export const platformSettingsQuery = queryOptions({
  queryKey: ["platform-settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("platform_settings").select("*").maybeSingle();
    if (error) throw error;
    return data;
  },
});

export function PlanPrice({ className = "" }: { className?: string }) {
  const { data } = useQuery(platformSettingsQuery);
  const price = Number(data?.price_amount ?? 0);
  return (
    <p className={className}>
      {price > 0 ? <>{money(price)} <span className="text-base font-medium text-muted-foreground">/ {data?.price_period || "mois"}</span></> : "Contactez-nous"}
    </p>
  );
}

export function ContactButtons({ email }: { email: string }) {
  const { data } = useQuery(platformSettingsQuery);
  const text = `Bonjour, je souhaite activer mon abonnement Boutik. Compte : ${email}`;
  const wa = (data?.contact_whatsapp ?? "").replace(/[^\d]/g, "");
  const mail = data?.contact_email ?? "";
  return (
    <div className="space-y-2">
      {data?.payment_instructions && <p className="whitespace-pre-line rounded-lg bg-muted p-3 text-left text-sm">{data.payment_instructions}</p>}
      {wa && (
        <Button asChild size="lg" className="h-12 w-full text-base">
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-5 w-5" /> S'abonner via WhatsApp</a>
        </Button>
      )}
      {mail && (
        <Button asChild size="lg" variant={wa ? "outline" : "default"} className="h-12 w-full text-base">
          <a href={`mailto:${mail}?subject=${encodeURIComponent("Activation abonnement")}&body=${encodeURIComponent(text)}`}><Mail className="h-5 w-5" /> S'abonner par email</a>
        </Button>
      )}
      {!wa && !mail && <p className="text-sm text-muted-foreground">Les coordonnées de contact seront bientôt disponibles.</p>}
    </div>
  );
}
