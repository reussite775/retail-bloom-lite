import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/format";
import { useRole } from "@/lib/role";

export const Route = createFileRoute("/_app/studio/ventes")({
  head: () => ({
    meta: [
      { title: "Ventes — Espace créateur GestiPro" },
      { name: "description", content: "Suivi des ventes de vos produits numériques." },
      { property: "og:title", content: "Ventes — Espace créateur GestiPro" },
      { property: "og:description", content: "Suivi des ventes de produits numériques." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreatorSales,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Payé", cls: "bg-primary/10 text-primary" },
  pending: { label: "En attente", cls: "bg-warning/25 text-warning-foreground" },
  failed: { label: "Échoué", cls: "bg-destructive/10 text-destructive" },
  expired: { label: "Expiré", cls: "bg-muted text-muted-foreground" },
};

function CreatorSales() {
  const { shopId } = useRole();
  const q = useQuery({
    queryKey: ["digital-orders", shopId],
    enabled: !!shopId,
    queryFn: async () => {
      const { data, error } = await supabase.from("digital_orders")
        .select("id, product_title, amount, buyer_name, buyer_phone, status, created_at, paid_at")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const orders = q.data ?? [];
  const paid = orders.filter((o) => o.status === "paid");
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-3xl font-extrabold">Vente</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Ventes payées</p><p className="mt-1 text-2xl font-extrabold tabular">{paid.length}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Montant confirmé</p><p className="mt-1 text-2xl font-extrabold tabular">{money(paid.reduce((a, o) => a + Number(o.amount), 0))}</p></div>
      </div>
      <div className="rounded-xl border bg-card">
        {q.isLoading ? <p className="p-6 text-muted-foreground">Chargement…</p>
          : orders.length === 0 ? <p className="p-6 text-muted-foreground">Aucune vente pour l'instant. Partagez le lien de vos produits publiés pour recevoir vos premières commandes.</p>
          : (
            <ul className="divide-y">
              {orders.map((o) => {
                const s = (STATUS[o.status] ?? STATUS["pending"])!;
                return (
                  <li key={o.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{o.product_title}</p>
                      <p className="text-xs text-muted-foreground">{o.buyer_name} · {o.buyer_phone} · {new Date(o.paid_at ?? o.created_at).toLocaleString("fr-FR")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold tabular">{money(Number(o.amount))}</span>
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