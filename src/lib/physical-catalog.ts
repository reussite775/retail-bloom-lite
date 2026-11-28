import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { matches } from "@/lib/stock";
import type { Tables } from "@/integrations/supabase/types";

export const BASE_UNITS = ["pièce", "carton", "paquet", "kilogramme", "gramme", "litre", "mètre"];
export const catalogOptionsQuery = (shop: string) => queryOptions({
  queryKey: ["catalog-options", shop],
  queryFn: async () => {
    const [categories, units, variants] = await Promise.all([
      supabase.from("product_categories").select("*").eq("organization_id", shop).order("name"),
      supabase.from("product_units").select("*").eq("organization_id", shop).order("name"),
      supabase.from("product_variants").select("*").eq("organization_id", shop).order("name"),
    ]);
    if (categories.error) throw categories.error;
    if (units.error) throw units.error;
    if (variants.error) throw variants.error;
    return { categories: categories.data, units: units.data, variants: variants.data };
  },
});
export function categoryLabel(c: Tables<"product_categories">, all: Tables<"product_categories">[]) {
  const parent = all.find((x) => x.id === c.parent_id);
  return parent ? `${parent.name} / ${c.name}` : c.name;
}
export function catalogMatches(p: Pick<Tables<"products">, "name" | "sku" | "barcode">, q: string, variants: Tables<"product_variants">[]) {
  return [p.name, p.sku, p.barcode, ...variants.flatMap((v) => [v.name, v.sku, v.barcode])].some((x) => matches(x, q));
}
export function referenceConflict(sku: string, barcode: string, rows: { id: string; sku: string; barcode: string }[], excludedId?: string) {
  return rows.some((r) => r.id !== excludedId && (
    (sku.trim() !== "" && r.sku.trim().toLowerCase() === sku.trim().toLowerCase()) ||
    (barcode.trim() !== "" && r.barcode === barcode.trim())
  ));
}
export function optionalPrice(value: string) {
  if (!value.trim()) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Le prix doit être positif ou nul");
  return n;
}
export function attributeObject(entries: { key: string; value: string }[]) {
  const result: Record<string, string> = {};
  for (const a of entries) {
    if (!a.key.trim() && !a.value.trim()) continue;
    if (!a.key.trim() || !a.value.trim()) throw new Error("Complétez le nom et la valeur de chaque attribut");
    if (Object.keys(result).some((k) => k.toLowerCase() === a.key.trim().toLowerCase())) throw new Error("Un attribut ne peut apparaître qu'une fois");
    result[a.key.trim()] = a.value.trim();
  }
  return result;
}

export function movementInput(kind: string, value: string, reason: string, hasVariants: boolean, variant: string) {
  const quantity = Number(value);
  if (!['in', 'out', 'adjustment', 'loss', 'damage'].includes(kind)) throw new Error('Opération invalide');
  if (!value.trim() || !Number.isInteger(quantity) || quantity < (kind === 'adjustment' ? 0 : 1)) throw new Error('Quantité invalide');
  if (!reason.trim()) throw new Error('Le motif est requis');
  if (hasVariants && !variant) throw new Error('Choisissez une variante');
  return { quantity, reason: reason.trim() };
}