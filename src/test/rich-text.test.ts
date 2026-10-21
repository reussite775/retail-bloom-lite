import { describe, expect, it } from "vitest";
import { isRichHtml, plainText, sanitizeRichText } from "@/lib/rich-text";

describe("sanitizeRichText", () => {
  it("keeps allowed formatting (headings, bold, lists, links)", () => {
    const html = sanitizeRichText('<h2>Titre</h2><p>Du <strong>gras</strong></p><ul><li>Item</li></ul><a href="https://exemple.com">Lien</a>');
    expect(html).toContain("<h2>Titre</h2>");
    expect(html).toContain("<strong>gras</strong>");
    expect(html).toContain("<li>Item</li>");
    expect(html).toContain('href="https://exemple.com"');
  });
  it("strips scripts and event handlers", () => {
    const html = sanitizeRichText('<p onclick="alert(1)">Salut</p><script>alert(2)</script><img src=x onerror=alert(3)>');
    expect(html).not.toMatch(/script|onclick|onerror|<img/i);
    expect(html).toContain("Salut");
  });
  it("rejects non-http links", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).not.toContain("href=");
  });
});

describe("plainText / isRichHtml", () => {
  it("extracts plain text for meta descriptions", () => {
    expect(plainText("<p>Bonjour <strong>le monde</strong></p>")).toBe("Bonjour le monde");
  });
  it("detects rich html vs plain text", () => {
    expect(isRichHtml("<p>Texte</p>")).toBe(true);
    expect(isRichHtml("Simple ligne de texte")).toBe(false);
  });
});
