import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { claimOrder } from "@/lib/learner.functions";
import { CheckCircle2, Clock, Download, Library, MessageCircle, PlayCircle, XCircle } from "lucide-react";
import { savePurchase } from "@/lib/learner-access";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { getDigitalOrder } from "@/lib/digital-orders.functions";
import { PRODUCT_TYPE_LABELS } from "@/components/sales-page-view";

export const Route = createFileRoute("/commande/$orderId")({
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s["t"] === "string" ? s["t"] : "",
    cancelled: s["cancelled"] ? 1 : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Suivi de votre commande — GestiPro" },
      { name: "description", content: "Statut du paiement et accès à votre achat." },
      { property: "og:title", content: "Suivi de votre commande — GestiPro" },
      { property: "og:description", content: "Statut du paiement et accès à votre achat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  ssr: false,
  component: OrderTracking,
});

function OrderTracking() {
  const { orderId } = Route.useParams();
  const { t, cancelled } = Route.useSearch();
  const fetchOrder = useServerFn(getDigitalOrder);
  const q = useQuery({
    queryKey: ["digital-order", orderId, t],
    queryFn: () => fetchOrder({ data: { id: orderId, token: t } }),
    enabled: !!t,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 6000 : false),
  });
  const o = q.data;
  useEffect(() => { if (o?.status === "paid" && t) savePurchase({ id: orderId, t }); }, [o?.status, orderId, t]);
  const { session } = useAuth();
  const claimFn = useServerFn(claimOrder);
  const claim = useMutation({
    mutationFn: () => claimFn({ data: { id: orderId, t } }),
    onSuccess: () => toast.success("Achat ajouté à votre bibliothèque"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border bg-card p-6">
          {!t || (q.isSuccess && !o) ? (
            <Status icon={<XCircle className="h-10 w-10 text-destructive" />} title="Commande introuvable"
              text="Ce lien de suivi n'est pas valide. Utilisez le lien reçu après votre paiement." />
          ) : q.isLoading ? (
            <p className="text-center text-muted-foreground">Chargement de votre commande…</p>
          ) : q.isError ? (
            <Status icon={<XCircle className="h-10 w-10 text-destructive" />} title="Impossible de charger la commande"
              text="Vérifiez votre connexion puis réessayez." action={<Button onClick={() => q.refetch()}>Réessayer</Button>} />
          ) : o ? (
            <>
              {o.status === "paid" && (
                <Status icon={<CheckCircle2 className="h-10 w-10 text-primary" />} title="Paiement confirmé"
                  text={`Merci ${o.buyerName} ! BkaPay a confirmé votre paiement.`} />
              )}
              {o.status === "pending" && (
                <Status icon={<Clock className="h-10 w-10 text-warning" />} title={cancelled ? "Paiement non terminé" : "Paiement en cours de confirmation"}
                  text={cancelled ? "Le paiement a été annulé ou interrompu. Aucun montant n'est confirmé pour cette commande." : "Nous attendons la confirmation officielle de BkaPay. Cette page se met à jour automatiquement."} />
              )}
              {(o.status === "failed" || o.status === "expired") && (
                <Status icon={<XCircle className="h-10 w-10 text-destructive" />} title={o.status === "failed" ? "Paiement échoué" : "Paiement expiré"}
                  text="Aucun paiement n'a été confirmé pour cette commande. Vous pouvez réessayer depuis la page du produit." />
              )}

              <dl className="mt-6 space-y-2 border-t pt-4 text-sm">
                <Row label="Produit" value={o.productTitle} />
                <Row label="Type" value={PRODUCT_TYPE_LABELS[o.productType] ?? o.productType} />
                {o.shopName && <Row label="Vendeur" value={o.shopName} />}
                <Row label="Montant" value={money(o.amount)} />
                <Row label="Commande" value={o.id.slice(0, 8).toUpperCase()} />
                <Row label="Date" value={new Date(o.paidAt ?? o.createdAt).toLocaleString("fr-FR")} />
              </dl>

              {o.status === "paid" && (
                <div className="mt-6 space-y-3">
                  {o.productRef && (
                    <Button asChild size="lg" className="w-full">
                      <Link to="/apprendre/$product" params={{ product: o.productRef }} search={{ o: o.id, t, l: undefined }}>
                        <PlayCircle className="h-4 w-4" /> {o.productType === "formation" ? "Accéder à ma formation" : o.productType === "file" ? "Accéder à mes fichiers" : "Accéder à mon contenu"}
                      </Link>
                    </Button>
                  )}
                  {o.downloadUrl && (
                    <Button asChild size="lg" className="w-full">
                      <a href={o.downloadUrl}><Download className="h-4 w-4" /> Télécharger {o.fileName ?? "le fichier"}</a>
                    </Button>
                  )}
                  {o.productType !== "file" && (
                    <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                      Le vendeur va vous contacter pour organiser votre {(PRODUCT_TYPE_LABELS[o.productType] ?? "prestation").toLowerCase()}.
                    </p>
                  )}
                  {o.shopContact && <ContactSeller contact={o.shopContact} order={o.id} title={o.productTitle} />}
                  {session ? (
                    <Button variant="outline" className="w-full" disabled={claim.isPending || claim.isSuccess} onClick={() => claim.mutate()}>
                      <Library className="h-4 w-4" /> {claim.isSuccess ? "Ajouté à ma bibliothèque" : "Ajouter à ma bibliothèque"}
                    </Button>
                  ) : (
                    <Button asChild variant="outline" className="w-full"><a href="/auth?client=1"><Library className="h-4 w-4" /> Créer mon espace client pour retrouver mes achats</a></Button>
                  )}
                  <p className="text-center text-xs text-muted-foreground">Gardez ce lien : il vous permet de retrouver votre achat.</p>
                </div>
              )}
            </>
          ) : null}
        </div>
        <p className="text-center text-xs text-muted-foreground">Propulsé par <Link to="/" className="hover:underline">GestiPro</Link></p>
      </div>
    </div>
  );
}

function Status({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {icon}
      <h1 className="text-xl font-extrabold">{title}</h1>
      <p className="text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words text-right font-medium">{value}</dd>
    </div>
  );
}

function ContactSeller({ contact, order, title }: { contact: string; order: string; title: string }) {
  const phone = contact.replace(/[^\d]/g, "");
  if (phone.length < 8) return <p className="text-center text-sm">Contact du vendeur : <span className="font-semibold">{contact}</span></p>;
  const msg = `Bonjour, j'ai acheté « ${title} » (commande ${order.slice(0, 8).toUpperCase()}) via GestiPro.`;
  return (
    <Button asChild variant="outline" className="w-full">
      <a href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
        <MessageCircle className="h-4 w-4" /> Contacter le vendeur sur WhatsApp
      </a>
    </Button>
  );
}