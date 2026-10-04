import { useEffect, useState, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type PendingSale = {
  id: string;
  createdAt: string;
  kind?: "sale" | "product_insert" | "product_update" | "manual_debt" | "debt_payment" | "order_insert";
  items?: { product_id: string; quantity: number }[];
  customerId?: string | undefined;
  total: number;
  payload?: Record<string, unknown>;
  label?: string;
};

const KEY = "boutik-pending-sales";
const listeners = new Set<() => void>();
let cache: PendingSale[] | null = null;

function read(): PendingSale[] {
  if (typeof window === "undefined") return [];
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cache = []; }
  return cache!;
}
function write(list: PendingSale[]) {
  cache = list;
  localStorage.setItem(KEY, JSON.stringify(list));
  listeners.forEach((l) => l());
}
const EMPTY: PendingSale[] = [];
export const usePendingSales = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, read, () => EMPTY);

export function queueOp(kind: NonNullable<PendingSale["kind"]>, payload: Record<string, unknown>, label: string, total = 0) {
  return queueSale({ kind, payload, label, total });
}

async function replay(op: PendingSale) {
  const p = (op.payload ?? {}) as Record<string, any>;
  switch (op.kind ?? "sale") {
    case "product_insert": return (await supabase.from("products").insert(p as any)).error;
    case "product_update": { const { id, ...row } = p; return (await supabase.from("products").update(row as any).eq("id", id)).error; }
    case "order_insert": return (await supabase.from("online_orders").insert(p as any)).error;
    case "manual_debt": return (await supabase.rpc("add_manual_debt", p as any)).error;
    case "debt_payment": return (await supabase.rpc("record_payment", p as any)).error;
    default:
      return (op.customerId
        ? await supabase.rpc("create_credit_sale", { _items: op.items ?? [], _customer_id: op.customerId })
        : await supabase.rpc("create_sale", { _items: op.items ?? [] })).error;
  }
}

export function queueSale(s: Omit<PendingSale, "id" | "createdAt">) {
  const sale = { ...s, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  write([...read(), sale]);
  return sale;
}

export const isNetworkError = (e: unknown) => {
  const m = String((e as { message?: string })?.message ?? e);
  return (typeof navigator !== "undefined" && !navigator.onLine) || /Failed to fetch|NetworkError|Load failed|network/i.test(m);
};

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", up); };
  }, []);
  return online;
}

let syncing = false;
export async function syncPendingSales(qc: QueryClient) {
  if (syncing || !navigator.onLine || read().length === 0) return;
  syncing = true;
  let ok = 0;
  try {
    for (const sale of [...read()]) {
      const error = await replay(sale);
      if (error && isNetworkError(error)) break; // still offline: keep the rest
      write(read().filter((x) => x.id !== sale.id));
      if (error) toast.error(`${sale.label ?? "Vente"} hors ligne de ${new Date(sale.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} refusée : ${error.message}`, { duration: 10000 });
      else ok++;
    }
  } finally {
    syncing = false;
    if (ok) {
      toast.success(`${ok} opération(s) hors ligne synchronisée(s)`);
      qc.invalidateQueries();
    }
  }
}
