import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { money } from "@/lib/format";
import { listAllDigitalOrders } from "@/lib/digital-orders.functions";
import { PRODUCT_TYPE_LABELS } from "@/components/sales-page-view";

export const Route = createFileRoute("/admin/ventes-numeriques")({
  head: () => ({
    meta: [
      { title: "Ventes numériques — Admin GestiPro" },
      { name: "description", content: "Paiements BkaPay des produits numériques de toutes les boutiques." },
      { property: "og:title", content: "Ventes numériques — Admin GestiPro" },
      { property: "og:description", content: "Paiements BkaPay des produits numériques." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DigitalSales,
});

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Payé", cls: "bg-primary/10 text-primary" },
  pending: { label: "En attente", cls: "bg-warning/25 text-warning-foreground" },
  failed: { label: "Échoué", cls: "bg-destructive/10 text-destructive" },
  expired: { label: "Expiré", cls: "bg-muted text-muted-foreground" },
};

function DigitalSales() {
  const list = useServerFn(listAllDigitalOrders);
  const q = useQuery({ queryKey: ["sa-digital-orders"], queryFn: () => list(), refetchInterval: 30000 });
  if (q.isLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (q.isError) return <p className="text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Encaissé (payé)" value={money(d.revenue)} />
        <Stat label="Ventes payées" value={String(d.paidCount)} />
        <Stat label="En attente" value={String(d.pendingCount)} />
      </div>
      <div className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h1 className="font-bold">Paiements des produits numériques</h1>
          <p className="text-sm text-muted-foreground">Un paiement passe à « Payé » uniquement après confirmation officielle de BkaPay.</p>
        </div>
        {d.orders.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">Aucune commande pour l'instant.</p>
        ) : (
          <ul className="divide-y">
            {d.orders.map((o) => {
              const s = (ORDER_STATUS[o.status] ?? ORDER_STATUS["pending"])!;
              return (
                <li key={o.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{o.product_title} <span className="font-normal text-muted-foreground">· {PRODUCT_TYPE_LABELS[o.product_type] ?? o.product_type}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {o.shop_name || "Boutique"} · {o.buyer_name} · {o.buyer_phone}{o.buyer_email ? ` · ${o.buyer_email}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.paid_at ?? o.created_at).toLocaleString("fr-FR")} · Cde {o.id.slice(0, 8).toUpperCase()}
                      {o.transaction_id ? ` · Transaction ${o.transaction_id}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold tabular">{money(o.amount)}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular">{value}</p>
    </div>
  );
}