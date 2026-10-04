import { useEffect, useState, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type PendingSale = {
  id: string;
  createdAt: string;
  items: { product_id: string; quantity: number }[];
  customerId?: string | undefined;
  total: number;
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
      const { error } = sale.customerId
        ? await supabase.rpc("create_credit_sale", { _items: sale.items, _customer_id: sale.customerId })
        : await supabase.rpc("create_sale", { _items: sale.items });
      if (error && isNetworkError(error)) break; // still offline: keep the rest
      write(read().filter((x) => x.id !== sale.id));
      if (error) toast.error(`Vente hors ligne de ${new Date(sale.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} refusée : ${error.message}`, { duration: 10000 });
      else ok++;
    }
  } finally {
    syncing = false;
    if (ok) {
      toast.success(`${ok} vente(s) hors ligne synchronisée(s)`);
      qc.invalidateQueries();
    }
  }
}
