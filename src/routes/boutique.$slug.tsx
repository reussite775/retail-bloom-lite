import { createFileRoute, Link } from '@tanstack/react-router';
import { FileDown } from 'lucide-react';
import { getPublicCreatorStore } from '@/lib/digital.functions';
import { money } from '@/lib/format';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/boutique/$slug')({
  loader: ({ params }) => getPublicCreatorStore({ data: { slug: params.slug } }),
  head: ({ loaderData }) => ({ meta: [
    { title: loaderData ? `${loaderData.name} — Boutique GestiPro` : 'Boutique indisponible — GestiPro' },
    { name: 'description', content: loaderData ? `Les produits numériques de ${loaderData.name}.` : 'Cette boutique est indisponible.' },
    { property: 'og:title', content: loaderData ? `${loaderData.name} — Boutique GestiPro` : 'Boutique indisponible — GestiPro' },
    { property: 'og:description', content: loaderData ? `Les produits numériques de ${loaderData.name}.` : 'Cette boutique est indisponible.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
    ...(loaderData ? [] : [{ name: 'robots', content: 'noindex' }]),
  ] }),
  component: StorePage,
});
function StorePage() {
  const store = Route.useLoaderData();
  if (!store) return <main className="mx-auto max-w-5xl px-4 py-16"><h1 className="text-2xl font-bold">Boutique indisponible</h1></main>;
  return <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
    <header className="border-b pb-6"><p className="mb-2 text-sm text-primary">Boutique numérique</p><h1 className="break-words text-3xl font-extrabold">{store.name}</h1></header>
    {store.products.length === 0 && <p className="text-muted-foreground">Aucun produit publié pour le moment.</p>}
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{store.products.map((p) => <article key={p.id} className="overflow-hidden rounded-lg border bg-card">
      {p.coverUrl ? <img src={p.coverUrl} alt={p.title} className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-primary/10"><FileDown className="h-10 w-10 text-primary" /></div>}
      <div className="space-y-3 p-4"><h2 className="break-words text-xl font-bold">{p.title}</h2><p className="font-bold text-primary">{money(p.price)}</p>{p.description && <p className="line-clamp-3 break-words text-sm text-muted-foreground">{p.description}</p>}<Button asChild variant="outline"><Link to="/p/$productId" params={{ productId: p.slug ?? p.id }}>Voir le produit</Link></Button></div>
    </article>)}</div>
    <footer className="border-t pt-5 text-center text-xs text-muted-foreground">Propulsé par GestiPro</footer>
  </main>;
}
