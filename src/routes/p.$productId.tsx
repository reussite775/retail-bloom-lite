import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicDigitalProduct } from "@/lib/digital.functions";
import { plainText } from "@/lib/rich-text";
import { SalesPageView } from "@/components/sales-page-view";

export const Route = createFileRoute("/p/$productId")({
  loader: ({ params }) => getPublicDigitalProduct({ data: { id: params.productId } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.title} — GestiPro` : "Produit indisponible — GestiPro" },
      { name: "description", content: plainText(loaderData?.description ?? "").slice(0, 150) || "Produit numérique vendu avec GestiPro." },
      { property: "og:title", content: loaderData?.title ?? "Produit indisponible" },
      { property: "og:description", content: plainText(loaderData?.description ?? "").slice(0, 150) || "Produit numérique vendu avec GestiPro." },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary" },
      ...(loaderData?.coverUrl?.startsWith("https://") ? [
        { property: "og:image", content: loaderData.coverUrl },
        { name: "twitter:image", content: loaderData.coverUrl },
      ] : []),
      ...(loaderData ? [] : [{ name: "robots", content: "noindex" }]),
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const p = Route.useLoaderData();
  if (!p) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-extrabold">Produit indisponible</h1>
          <p className="mt-2 text-muted-foreground">Ce produit n'existe pas ou n'est pas encore publié.</p>
          <Link to="/" className="mt-4 inline-block text-primary hover:underline">GestiPro</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-muted/40 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <SalesPageView
          data={{
            title: p.title,
            description: p.description,
            price: p.price,
            coverUrl: p.coverUrl,
            shopName: p.shopName,
            productType: p.product_type,
            pageConfig: p.pageConfig,
          }}
        />
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Propulsé par GestiPro</p>
    </div>
  );
}
