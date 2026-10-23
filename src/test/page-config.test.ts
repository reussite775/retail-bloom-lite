import { describe, expect, it } from "vitest";
import { emptyPageConfig, hasAnySection, normalizePageConfig } from "@/lib/page-config";

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
    expect(cfg?.testimonials[0]).toEqual({ name: "Awa", text: "Super produit" });
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
