import { describe, expect, it } from "vitest";
import { emptyPageConfig, hasAnySection, moveSection, normalizePageConfig, normalizeSectionOrder, SECTION_KEYS } from "@/lib/page-config";
import { applyTemplate, templatesFor } from "@/lib/sales-templates";

describe("normalizePageConfig", () => {
  it("returns null for empty or invalid input (classic page unchanged)", () => {
    expect(normalizePageConfig(null)).toBeNull();
    expect(normalizePageConfig(undefined)).toBeNull();
    expect(normalizePageConfig("texte")).toBeNull();
    expect(normalizePageConfig([])).toBeNull();
    expect(normalizePageConfig({})).toBeNull();
    expect(normalizePageConfig(emptyPageConfig())).toBeNull();
  });

  it("strips HTML tags from all section content", () => {
    const cfg = normalizePageConfig({
      benefits: ["<b>Gras</b><script>alert(1)</script>"],
      faq: [{ q: "<img src=x onerror=alert(1)>Question ?", a: "<i>Réponse</i>" }],
      testimonials: [{ name: "<b>Awa</b>", text: "Super <script>x</script>produit" }],
      ctaLabel: "<a href='https://x'>Acheter</a>",
    });
    expect(cfg?.benefits).toEqual(["Grasalert(1)"]);
    expect(cfg?.faq[0]).toEqual({ q: "Question ?", a: "Réponse" });
    // Les balises sont supprimées ; le texte restant est inerte (jamais interprété).
    expect(cfg?.testimonials[0]).toEqual({ name: "Awa", text: "Super xproduit" });
    expect(cfg?.ctaLabel).toBe("Acheter");
  });

  it("enforces item count and length limits", () => {
    const cfg = normalizePageConfig({
      benefits: Array.from({ length: 20 }, (_, i) => `b${i}`),
      included: Array.from({ length: 30 }, (_, i) => `i${i}`),
      faq: Array.from({ length: 15 }, (_, i) => ({ q: `q${i}`, a: `a${i}` })),
      testimonials: Array.from({ length: 10 }, (_, i) => ({ name: `n${i}`, text: `t${i}` })),
      ctaLabel: "x".repeat(100),
    });
    expect(cfg?.benefits).toHaveLength(12);
    expect(cfg?.included).toHaveLength(20);
    expect(cfg?.faq).toHaveLength(12);
    expect(cfg?.testimonials).toHaveLength(8);
    expect(cfg?.ctaLabel).toHaveLength(40);
  });

  it("drops blank items and incomplete pairs", () => {
    const cfg = normalizePageConfig({
      benefits: ["  ", "Valide"],
      faq: [{ q: "Sans réponse", a: "" }, { q: "", a: "Sans question" }, { q: "Q", a: "R" }],
      testimonials: [{ name: "", text: "Sans nom" }],
    });
    expect(cfg?.benefits).toEqual(["Valide"]);
    expect(cfg?.faq).toEqual([{ q: "Q", a: "R" }]);
    expect(cfg?.testimonials).toEqual([]);
  });

  it("hasAnySection detects a configured page", () => {
    expect(hasAnySection(null)).toBe(false);
    expect(hasAnySection(emptyPageConfig())).toBe(false);
    expect(hasAnySection({ ...emptyPageConfig(), ctaLabel: "Acheter" })).toBe(true);
  });
});

describe("sectionOrder", () => {
  it("normalizeSectionOrder keeps known keys, drops unknown and duplicates, appends missing", () => {
    expect(normalizeSectionOrder(["faq", "inconnu", "faq", "benefits"])).toEqual(["faq", "benefits", "included", "testimonials"]);
    expect(normalizeSectionOrder(null)).toEqual(SECTION_KEYS);
    expect(normalizeSectionOrder("texte")).toEqual(SECTION_KEYS);
  });

  it("moveSection swaps adjacent sections and is a no-op at the edges", () => {
    const order = [...SECTION_KEYS];
    expect(moveSection(order, "included", -1)).toEqual(["included", "benefits", "testimonials", "faq"]);
    expect(moveSection(order, "benefits", -1)).toEqual(order);
    expect(moveSection(order, "faq", 1)).toEqual(order);
    expect(moveSection(order, "benefits", 1)).toEqual(["included", "benefits", "testimonials", "faq"]);
  });

  it("normalizePageConfig preserves a custom section order", () => {
    const cfg = normalizePageConfig({ benefits: ["Un atout"], sectionOrder: ["faq", "benefits", "included", "testimonials"] });
    expect(cfg?.sectionOrder).toEqual(["faq", "benefits", "included", "testimonials"]);
  });
});

describe("applyTemplate", () => {
  it("fills only empty sections and sets order and template id", () => {
    const t = templatesFor("formation")[0];
    const cfg = applyTemplate(emptyPageConfig(), t);
    expect(cfg.template).toBe(t.id);
    expect(cfg.sectionOrder).toEqual(t.sectionOrder);
    expect(cfg.benefits.length).toBeGreaterThan(0);
    expect(cfg.ctaLabel).toBe(t.content.ctaLabel);
  });

  it("never overwrites content already entered by the creator", () => {
    const t = templatesFor("formation")[0];
    const existing = { ...emptyPageConfig(), benefits: ["Mon atout personnel"], ctaLabel: "Mon bouton" };
    const cfg = applyTemplate(existing, t);
    expect(cfg.benefits).toEqual(["Mon atout personnel"]);
    expect(cfg.ctaLabel).toBe("Mon bouton");
    // Les sections vides, elles, reçoivent le contenu d'exemple.
    expect(cfg.included.length).toBeGreaterThan(0);
  });

  it("templatesFor falls back to file templates for unknown types", () => {
    expect(templatesFor("formation").length).toBeGreaterThan(0);
    expect(templatesFor("inconnu")).toEqual(templatesFor("file"));
  });
});
