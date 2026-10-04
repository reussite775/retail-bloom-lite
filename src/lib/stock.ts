export const LOW_STOCK = 5;
export type StockLevel = "out" | "low" | "ok";
export const stockLevel = (n: number): StockLevel => (n <= 0 ? "out" : n <= LOW_STOCK ? "low" : "ok");
export const stockBadge: Record<StockLevel, string> = {
  out: "bg-destructive/10 text-destructive",
  low: "bg-warning/25 text-warning-foreground",
  ok: "bg-primary-soft text-accent-foreground",
};
export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const matches = (name: string, q: string) => norm(name).includes(norm(q));
