import { createFileRoute } from "@tanstack/react-router";
import { useRole } from "@/lib/role";
import { CreatorStoreLink } from "@/components/creator-store-link";
import { DigitalProducts } from "@/components/digital-products";

export const Route = createFileRoute("/_app/studio/produits")({
  head: () => ({
    meta: [
      { title: "Produits numériques — GestiPro" },
      { name: "description", content: "Créez, modifiez et publiez vos produits numériques." },
      { property: "og:title", content: "Produits numériques — GestiPro" },
      { property: "og:description", content: "Gérez vos produits numériques sur GestiPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => {
    const { shopId } = useRole();
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-extrabold">Produits</h1>
        {shopId && <><CreatorStoreLink shopId={shopId} /><DigitalProducts shopId={shopId} /></>}
      </div>
    );
  },
});
