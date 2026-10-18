import { beforeEach, describe, expect, it, vi } from "vitest";
import { digitalProductLink } from "@/lib/digital-links";

const db = vi.hoisted(() => ({
  product: null as Record<string, unknown> | null,
  filters: {} as Record<string, unknown>,
  select: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (validate: (data: unknown) => unknown) => ({
      handler: (handler: (input: { data: unknown }) => unknown) =>
        (input: { data: unknown }) => handler({ data: validate(input.data) }),
    }),
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const query = {
        select: (columns: string) => { db.select(table, columns); return query; },
        eq: (column: string, value: unknown) => { db.filters[column] = value; return query; },
        maybeSingle: async () => ({ data: table === "digital_products" &&
          db.product?.id === db.filters.id && db.product?.status === db.filters.status
          ? db.product : null }),
      };
      return query;
    },
  }),
}));

import { getPublicDigitalProduct } from "@/lib/digital.functions";

const id = "adb7d70b-c9d2-4563-bc6d-af0fdba4ddec";

beforeEach(() => {
  db.filters = {};
  db.select.mockClear();
  db.product = { id, organization_id: "shop", status: "published", title: "100PRIERES",
    description: "Livre numérique", price: 2000, cover_path: null };
});

describe("Public digital products", () => {
  it("shares the permanent public domain even when the seller uses the preview", () => {
    expect(digitalProductLink(id)).toBe(`https://getcommercestream.app/p/${id}`);
  });

  it("returns published product information without a seller session or a digital file", async () => {
    const product = await getPublicDigitalProduct({ data: { id } });
    expect(product).toMatchObject({ id, title: "100PRIERES", description: "Livre numérique", price: 2000 });
    expect(db.select).toHaveBeenCalledWith("digital_products", "id, organization_id, title, description, price, cover_path, status");
    expect(product).not.toHaveProperty("file_path");
  });

  it("never returns a draft to an anonymous visitor", async () => {
    db.product = { ...db.product, status: "draft" };
    expect(await getPublicDigitalProduct({ data: { id } })).toBeNull();
    expect(db.filters.status).toBe("published");
  });
});