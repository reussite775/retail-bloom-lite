import { Check, FileDown, HelpCircle, Package, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { isRichHtml, sanitizeRichText } from "@/lib/rich-text";
import type { PageConfig, PageSectionKey } from "@/lib/page-config";

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  file: "Fichier numérique",
  formation: "Formation",
  service: "Service",
  coaching: "Coaching",
};

export type SalesPageData = {
  title: string;
  description: string;
  price: number;
  coverUrl?: string | null;
  shopName?: string | null;
  productType?: string | null;
  pageConfig?: PageConfig | null;
};

// Une section de la page de vente. Chaque bloc n'est rendu que s'il a du contenu.
function SectionBlock({ section, config }: { section: PageSectionKey; config: PageConfig }) {
  if (section === "benefits" && config.benefits.length > 0) {
    return (
      <section>
        <h2 className="text-lg font-bold">Ce que vous allez obtenir</h2>
        <ul className="mt-2 space-y-2">
          {config.benefits.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="break-words">{b}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (section === "included" && config.included.length > 0) {
    return (
      <section>
        <h2 className="text-lg font-bold">Contenu inclus</h2>
        <ul className="mt-2 space-y-2">
          {config.included.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="break-words">{b}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (section === "testimonials" && config.testimonials.length > 0) {
    return (
      <section>
        <h2 className="text-lg font-bold">Ils en parlent</h2>
        <div className="mt-2 space-y-3">
          {config.testimonials.map((t, i) => (
            <figure key={i} className="rounded-lg bg-muted p-3">
              <Quote className="h-4 w-4 text-primary" />
              <blockquote className="mt-1 break-words text-sm text-muted-foreground">{t.text}</blockquote>
              <figcaption className="mt-1 text-xs font-semibold">{t.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
  }
  if (section === "faq" && config.faq.length > 0) {
    return (
      <section>
        <h2 className="text-lg font-bold">Questions fréquentes</h2>
        <div className="mt-2 space-y-3">
          {config.faq.map((f, i) => (
            <div key={i}>
              <p className="flex items-start gap-2 text-sm font-semibold">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="break-words">{f.q}</span>
              </p>
              <p className="ml-6 mt-1 break-words text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return null;
}

// Sections modulaires de la page de vente, partagées entre la page publique
// et l'aperçu du studio pour garantir que l'aperçu = la réalité.
// L'ordre d'affichage suit config.sectionOrder (réordonnable dans le studio).
export function SalesPageSections({ config }: { config: PageConfig }) {
  return (
    <div className="space-y-6 border-t pt-5">
      {config.sectionOrder.map((key) => (
        <SectionBlock key={key} section={key} config={config} />
      ))}
    </div>
  );
}

// Corps complet de la page de vente (couverture, titre, prix, description,
// sections, bouton d'action). Utilisé par /p/$productId et par l'aperçu du studio.
export function SalesPageView({ data, onCta }: { data: SalesPageData; onCta?: () => void }) {
  const cfg = data.pageConfig ?? null;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {data.coverUrl ? (
        <img src={data.coverUrl} alt={data.title} className="aspect-video w-full object-cover" />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-primary/10">
          <FileDown className="h-12 w-12 text-primary" />
        </div>
      )}
      <div className="space-y-4 p-6">
        {data.shopName && <p className="text-sm font-medium text-muted-foreground">{data.shopName}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="break-words text-2xl font-extrabold">{data.title}</h1>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {PRODUCT_TYPE_LABELS[data.productType ?? "file"] ?? "Fichier numérique"}
          </span>
        </div>
        <p className="font-display text-3xl font-extrabold tabular text-primary">{money(data.price)}</p>
        {data.description &&
          (isRichHtml(data.description) ? (
            <div
              className="break-words text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-1"
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(data.description) }}
            />
          ) : (
            <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{data.description}</p>
          ))}
        {cfg && <SalesPageSections config={cfg} />}
        {cfg?.ctaLabel && (
          <Button type="button" size="lg" className="w-full" onClick={onCta}>
            {cfg.ctaLabel}
          </Button>
        )}
        <div className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">
          L'achat en ligne sera bientôt disponible.
        </div>
      </div>
    </div>
  );
}
