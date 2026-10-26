// Configuration des sections de la page de vente d'un produit numérique.
// Stockée en JSONB (digital_products.page_config). NULL = page classique inchangée.
// Tout le contenu est du texte brut : les balises HTML sont supprimées à la normalisation
// (la description enrichie, elle, passe par sanitizeRichText).

export type PageSectionKey = "benefits" | "included" | "testimonials" | "faq";

export const SECTION_KEYS: PageSectionKey[] = ["benefits", "included", "testimonials", "faq"];

export const SECTION_LABELS: Record<PageSectionKey, string> = {
  benefits: "Ce que le client va obtenir",
  included: "Contenu inclus",
  testimonials: "Témoignages",
  faq: "Questions fréquentes",
};

export type PageConfig = {
  benefits: string[];
  included: string[];
  faq: { q: string; a: string }[];
  testimonials: { name: string; text: string }[];
  ctaLabel: string;
  // Ordre d'affichage des sections sur la page de vente.
  sectionOrder: PageSectionKey[];
  // Identifiant du modèle de page appliqué (voir sales-templates.ts), "" = aucun.
  template: string;
};

export const emptyPageConfig = (): PageConfig => ({
  benefits: [],
  included: [],
  faq: [],
  testimonials: [],
  ctaLabel: "",
  sectionOrder: [...SECTION_KEYS],
  template: "",
});

const cleanText = (v: unknown, max: number): string =>
  String(v ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const cleanList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => cleanText(x, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

// Ordre des sections : ne garde que les clés connues, sans doublon, puis complète
// avec les sections manquantes dans l'ordre par défaut (rétrocompatibilité des
// configurations enregistrées avant l'ajout de sectionOrder).
export function normalizeSectionOrder(raw: unknown): PageSectionKey[] {
  const seen = new Set<PageSectionKey>();
  const order: PageSectionKey[] = [];
  if (Array.isArray(raw)) {
    for (const k of raw) {
      if ((SECTION_KEYS as string[]).includes(k as string) && !seen.has(k as PageSectionKey)) {
        seen.add(k as PageSectionKey);
        order.push(k as PageSectionKey);
      }
    }
  }
  for (const k of SECTION_KEYS) if (!seen.has(k)) order.push(k);
  return order;
}

// Déplace une section d'un cran (-1 = monter, +1 = descendre).
export function moveSection(order: PageSectionKey[], key: PageSectionKey, delta: -1 | 1): PageSectionKey[] {
  const i = order.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j] as PageSectionKey, next[i] as PageSectionKey];
  return next;
}

export function hasAnySection(c: PageConfig | null | undefined): boolean {
  return !!c && (c.benefits.length > 0 || c.included.length > 0 || c.faq.length > 0 || c.testimonials.length > 0 || !!c.ctaLabel);
}

// Normalise une valeur inconnue (base de données ou saisie) en PageConfig sûre.
// Retourne null si aucune section n'est remplie, pour garder le rendu classique.
export function normalizePageConfig(raw: unknown): PageConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const faq = (Array.isArray(r["faq"]) ? r["faq"] : [])
    .map((x) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return { q: cleanText(o["q"], 200), a: cleanText(o["a"], 1000) };
    })
    .filter((x) => x.q && x.a)
    .slice(0, 12);

  const testimonials = (Array.isArray(r["testimonials"]) ? r["testimonials"] : [])
    .map((x) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return { name: cleanText(o["name"], 80), text: cleanText(o["text"], 500) };
    })
    .filter((x) => x.name && x.text)
    .slice(0, 8);

  const config: PageConfig = {
    benefits: cleanList(r["benefits"], 12, 200),
    included: cleanList(r["included"], 20, 200),
    faq,
    testimonials,
    ctaLabel: cleanText(r["ctaLabel"], 40),
    sectionOrder: normalizeSectionOrder(r["sectionOrder"]),
    template: cleanText(r["template"], 40),
  };
  return hasAnySection(config) ? config : null;
}
