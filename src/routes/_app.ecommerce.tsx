import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Globe, Package, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { membershipQuery, productsQuery } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { DigitalProducts } from "@/components/digital-products";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_app/ecommerce")({
  head: () => ({
    meta: [
      { title: "E-commerce — GestiPro" },
      { name: "description", content: "Préparez la vente en ligne de votre boutique : catalogue et commandes en ligne." },
      { property: "og:title", content: "E-commerce — GestiPro" },
      { property: "og:description", content: "Catalogue en ligne et commandes de votre boutique GestiPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ecommerce,
});

// Reads only the current shop's rows: RLS on products / online_orders is scoped by current_shop().
const ordersSummaryQuery = {
  queryKey: ["online_orders", "summary"],
  queryFn: async () => {
    const { data, error } = await supabase.from("online_orders").select("status, amount, delivery_fee").limit(10000);
    if (error) throw error;
    return data;
  },
};

function Ecommerce() {
  const { session } = useAuth();
  const member = useQuery({ ...membershipQuery(session?.user.id ?? ""), enabled: !!session });
  const products = useQuery(productsQuery);
  const orders = useQuery(ordersSummaryQuery);
  const prods = products.data ?? [];
  const list = orders.data ?? [];
  const inStock = prods.filter((p) => p.stock > 0).length;
  const delivered = list.filter((o) => o.status === "Livré");
  const open = list.filter((o) => o.status !== "Livré" && o.status !== "Annulé").length;
  const revenue = delivered.reduce((s, o) => s + Number(o.amount) + Number(o.delivery_fee), 0);

  const stats = [
    { label: "Produits au catalogue", value: String(prods.length), icon: Boxes },
    { label: "Produits disponibles", value: String(inStock), icon: Package },
    { label: "Commandes en cours", value: String(open), icon: Truck },
    { label: "Ventes en ligne livrées", value: money(revenue), icon: Globe },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">E-commerce</h1>
        <p className="text-muted-foreground">Préparez la vente en ligne de votre boutique.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
              <s.icon className="h-5 w-5 opacity-80" />
            </div>
            <p className="mt-3 font-display text-2xl font-extrabold tabular">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-6">
          <h2 className="flex items-center gap-2 font-bold"><Boxes className="h-4 w-4 text-primary" /> Produits en ligne</h2>
          <p className="mt-2 text-sm text-muted-foreground">Votre catalogue en ligne s'appuiera sur vos produits et stocks existants. La sélection des produits à publier arrive bientôt.</p>
          <Link to="/produits" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Gérer mes produits</Link>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h2 className="flex items-center gap-2 font-bold"><Truck className="h-4 w-4 text-primary" /> Commandes en ligne</h2>
          <p className="mt-2 text-sm text-muted-foreground">{list.length} commande(s) enregistrée(s), dont {delivered.length} livrée(s). La gestion des commandes du catalogue en ligne arrive bientôt.</p>
          <Link to="/commandes" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Voir les commandes</Link>
        </div>
      </div>
      {member.data?.shopId && <DigitalProducts shopId={member.data.shopId} />}
    </div>
  );
}
