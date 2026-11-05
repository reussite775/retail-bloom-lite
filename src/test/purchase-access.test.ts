import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: vi.fn(), setCookie: vi.fn(), deleteCookie: vi.fn(), setResponseHeader: vi.fn() }));
import { authorizePurchase, purchaseIdentity, type PurchaseAdmin } from "@/lib/purchase-access.server";

// In-memory server adapter: no network requests or production inserts.
function database(status = "paid", owner: string | null = null, failClaim = false) {
  const row = { id: "order", status, access_token: "a".repeat(48), product_id: "product", organization_id: "shop", buyer_name: "Buyer" };
  return {
    auth: { getUser: vi.fn(async (jwt: string) => ({ data: { user: jwt === "valid-owner" ? { id: "owner" } : jwt === "valid-other" ? { id: "other" } : null }, error: null })) },
    from: (table: string) => {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => table === "digital_orders" ? { data: row, error: null } : { data: owner ? { user_id: owner } : null, error: failClaim ? new Error("unavailable") : null } };
      return query;
    },
  } as unknown as PurchaseAdmin;
}
describe("server purchase authorization", () => {
  it("unclaimed paid order remains accessible by its exact secret", async () => {
    expect(await authorizePurchase(database(), "order", "a".repeat(48), "product", "shop", null)).not.toBeNull();
  });
  it("same link is refused as soon as the order is claimed", async () => {
    expect(await authorizePurchase(database("paid", "owner"), "order", "a".repeat(48), "product", "shop", null)).toBeNull();
  });
  it("owner authenticated on two independent devices keeps access without the secret", async () => {
    for (const device of ["phone", "computer"]) {
      const sb = database("paid", "owner");
      const user = await purchaseIdentity(sb, "Bearer valid-owner");
      expect(await authorizePurchase(sb, "order", undefined, "product", "shop", user), device).not.toBeNull();
    }
  });
  it("other account and forged credentials never unlock claimed content", async () => {
    const sb = database("paid", "owner");
    for (const jwt of ["valid-other", "forged"]) {
      expect(await authorizePurchase(sb, "order", "a".repeat(48), "product", "shop", await purchaseIdentity(sb, `Bearer ${jwt}`))).toBeNull();
    }
  });
  it("unpaid orders remain inaccessible even to the owner", async () => {
    for (const status of ["pending", "failed", "expired"]) expect(await authorizePurchase(database(status, "owner"), "order", "a".repeat(48), "product", "shop", "owner")).toBeNull();
  });
  it("wrong product, wrong shop and failed claim lookup are refused", async () => {
    expect(await authorizePurchase(database(), "order", "a".repeat(48), "other-product", "shop", null)).toBeNull();
    expect(await authorizePurchase(database(), "order", "a".repeat(48), "product", "other-shop", null)).toBeNull();
    expect(await authorizePurchase(database("paid", null, true), "order", "a".repeat(48), "product", "shop", null)).toBeNull();
  });
});