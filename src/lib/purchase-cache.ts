const BUYER_KEYS = new Set(["learn", "learn-lesson", "my-library", "my-purchases", "digital-order"]);
export function isPurchaseQuery(key: readonly unknown[]): boolean {
  return typeof key[0] === "string" && BUYER_KEYS.has(key[0]);
}
// Paid content must be re-authorized online, never restored from the merchant offline cache.
export const purchaseQueryOptions = { networkMode: "always" as const, gcTime: 0, staleTime: 0 };