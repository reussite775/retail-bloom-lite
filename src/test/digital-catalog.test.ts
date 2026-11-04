import { describe, it, expect } from "vitest";
import { DEFAULT_FILTERS, copiedPath, duplicateRow, filterCatalog } from "@/lib/digital-catalog";

const items = [
  { id: "a", title: "Guide Épargne", status: "published", product_type: "file", category_id: "c1" },
  { id: "b", title: "Formation Excel", status: "draft", product_type: "formation", category_id: null },
  { id: "c", title: "Ancien coaching", status: "archived", product_type: "coaching", category_id: "c1" },
];
const membership = new Map([["b", new Set(["col1"])]]);
const ids = (f: Partial<typeof DEFAULT_FILTERS>) => filterCatalog(items, { ...DEFAULT_FILTERS, ...f }, membership).map((p) => p.id);

describe("filterCatalog", () => {
  it("hides archived products by default", () => expect(ids({})).toEqual(["a", "b"]));
  it("shows only archived in the archived tab", () => expect(ids({ status: "archived" })).toEqual(["c"]));
  it("filters by status draft / published", () => {
    expect(ids({ status: "draft" })).toEqual(["b"]);
    expect(ids({ status: "published" })).toEqual(["a"]);
  });
  it("searches by name ignoring case and accents", () => expect(ids({ q: "epargne" })).toEqual(["a"]));
  it("filters by type", () => expect(ids({ type: "formation" })).toEqual(["b"]));
  it("filters by category and 'none'", () => {
    expect(ids({ categoryId: "c1", status: "all" })).toEqual(["a", "c"]);
    expect(ids({ categoryId: "none" })).toEqual(["b"]);
  });
  it("filters by collection", () => expect(ids({ collectionId: "col1" })).toEqual(["b"]));
});

describe("duplicateRow", () => {
  const src = { organization_id: "org", title: "Mon e-book", description: "<p>x</p>", price: 2000, product_type: "file", page_config: { faq: [] }, category_id: "c1", file_name: "book.pdf" };
  it("creates a draft with new id, no slug, and same content", () => {
    const r = duplicateRow(src, "new-id", { cover_path: "org/new-id/c.png", file_path: "org/new-id/f.pdf" });
    expect(r).toMatchObject({ id: "new-id", status: "draft", slug: null, title: "Mon e-book (copie)", price: 2000, category_id: "c1", file_name: "book.pdf", organization_id: "org" });
  });
  it("drops file name when there is no file", () => {
    expect(duplicateRow(src, "n", { cover_path: null, file_path: null }).file_name).toBeNull();
  });
  it("keeps copies under the shop/new product folder", () => {
    expect(copiedPath("org", "new-id", "org/old-id/file-1.pdf")).toBe("org/new-id/file-1.pdf");
  });
});
