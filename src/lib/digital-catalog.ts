// Pure catalog helpers for the creator product list (filters, duplication payload).

export type CatalogStatusFilter = "active" | "draft" | "published" | "archived" | "all";

export type CatalogFilters = {
  q: string;
  type: string; // "all" or a product_type
  status: CatalogStatusFilter;
  categoryId: string; // "all" | "none" | category id
  collectionId: string; // "all" | collection id
};

export const DEFAULT_FILTERS: CatalogFilters = { q: "", type: "all", status: "active", categoryId: "all", collectionId: "all" };

export const STATUS_LABELS: Record<string, string> = { draft: "Brouillon", published: "Publié", archived: "Archivé" };

type Filterable = { id: string; title: string; status: string; product_type: string | null; category_id: string | null };

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** membership: product id -> set of collection ids it belongs to. */
export function filterCatalog<T extends Filterable>(items: T[], f: CatalogFilters, membership: Map<string, Set<string>>): T[] {
  const q = fold(f.q);
  return items.filter((p) => {
    if (q && !fold(p.title).includes(q)) return false;
    if (f.type !== "all" && (p.product_type ?? "file") !== f.type) return false;
    if (f.status === "active" && p.status === "archived") return false;
    if (f.status !== "active" && f.status !== "all" && p.status !== f.status) return false;
    if (f.categoryId === "none" && p.category_id) return false;
    if (f.categoryId !== "all" && f.categoryId !== "none" && p.category_id !== f.categoryId) return false;
    if (f.collectionId !== "all" && !membership.get(p.id)?.has(f.collectionId)) return false;
    return true;
  });
}

type Source = {
  organization_id: string; title: string; description: string; price: number; product_type: string;
  page_config: unknown; category_id: string | null; file_name: string | null;
};

/**
 * Row for a duplicated product: same content and configuration, new id, always a draft,
 * slug left null so the database generates a fresh unique public name.
 * Orders, buyers, payments and stats live in other tables and are never copied.
 */
export function duplicateRow(src: Source, newId: string, paths: { cover_path: string | null; file_path: string | null }) {
  return {
    id: newId,
    organization_id: src.organization_id,
    title: `${src.title} (copie)`.slice(0, 200),
    description: src.description,
    price: src.price,
    product_type: src.product_type,
    page_config: src.page_config as never,
    category_id: src.category_id,
    cover_path: paths.cover_path,
    file_path: paths.file_path,
    file_name: paths.file_path ? src.file_name : null,
    status: "draft" as const,
    slug: null,
  };
}

/** Storage path for a copied asset, kept under the shop/product folder required by storage rules. */
export function copiedPath(shopId: string, newId: string, oldPath: string): string {
  const name = oldPath.split("/").pop() ?? "asset";
  return `${shopId}/${newId}/${name}`;
}
