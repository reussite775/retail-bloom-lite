export const LOW_STOCK = 5;
export type StockLevel = "out" | "low" | "ok";
export const stockLevel = (n: number, threshold: number = LOW_STOCK): StockLevel => (n <= 0 ? "out" : n <= threshold ? "low" : "ok");
export const levelOf = (p: { stock: number; low_stock_threshold?: number | null }) => stockLevel(p.stock, p.low_stock_threshold ?? LOW_STOCK);
export const stockBadge: Record<StockLevel, string> = {
  out: "bg-destructive/10 text-destructive",
  low: "bg-warning/25 text-warning-foreground",
  ok: "bg-primary-soft text-accent-foreground",
};
export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const matches = (name: string, q: string) => norm(name).includes(norm(q));
