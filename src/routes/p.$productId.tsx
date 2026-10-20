import { createFileRoute, Link } from "@tanstack/react-router";
import { FileDown } from "lucide-react";
import { getPublicDigitalProduct } from "@/lib/digital.functions";
import { money } from "@/lib/format";
import { isRichHtml, plainText, sanitizeRichText } from "@/lib/rich-text";

export const Route = createFileRoute("/p/$productId")({
  loader: ({ params }) => getPublicDigitalProduct({ data: { id: params.productId } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.title} — GestiPro` : "Produit indisponible — GestiPro" },
      { name: "description", content: loaderData?.description?.slice(0, 150) || "Produit numérique vendu avec GestiPro." },
      { property: "og:title", content: loaderData?.title ?? "Produit indisponible" },
      { property: "og:description", content: loaderData?.description?.slice(0, 150) || "Produit numérique vendu avec GestiPro." },
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
      <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border bg-card">
        {p.coverUrl ? <img src={p.coverUrl} alt={p.title} className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-primary/10"><FileDown className="h-12 w-12 text-primary" /></div>}
        <div className="space-y-4 p-6">
          {p.shopName && <p className="text-sm font-medium text-muted-foreground">{p.shopName}</p>}
           <h1 className="break-words text-2xl font-extrabold">{p.title}</h1>
          <p className="font-display text-3xl font-extrabold text-primary tabular">{money(p.price)}</p>
           {p.description && <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{p.description}</p>}
          <div className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">L'achat en ligne sera bientôt disponible.</div>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Propulsé par GestiPro</p>
    </div>
  );
}
