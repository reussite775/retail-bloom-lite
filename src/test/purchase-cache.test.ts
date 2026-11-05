import { describe, it, expect } from "vitest";
import { isPurchaseQuery, purchaseQueryOptions } from "@/lib/purchase-cache";
describe("buyer content cache isolation", () => {
  it("excludes all buyer content paths but preserves physical shop caching", () => {
    for (const key of ["learn", "learn-lesson", "my-library", "my-purchases", "digital-order"]) expect(isPurchaseQuery([key, "order"])).toBe(true);
    for (const key of ["products", "sales", "debts"]) expect(isPurchaseQuery([key])).toBe(false);
  });
  it("requires online authorization and discards unmounted paid content", () => {
    expect(purchaseQueryOptions).toEqual({ networkMode: "always", gcTime: 0, staleTime: 0 });
  });
});