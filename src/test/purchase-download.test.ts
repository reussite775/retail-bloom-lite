import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  owner: null as string | null, status: "paid", free: false, published: true,
  get: undefined as undefined | ((arg: { request: Request }) => Promise<Response>),
  signed: vi.fn(async () => ({ data: { signedUrl: "https://storage.test/internal-only" } })),
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: { server: { handlers: { GET: typeof fixture.get } } }) => { fixture.get = options.server.handlers.GET; return options; } }));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: () => undefined, getRequestHeader: () => undefined, setResponseHeader: vi.fn(), setCookie: vi.fn(), deleteCookie: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  auth: { getUser: async (jwt: string) => ({ data: { user: ["owner", "other"].includes(jwt) ? { id: jwt } : null }, error: null }) },
  storage: { from: () => ({ createSignedUrl: fixture.signed }) },
  from: (table: string) => {
    const org = "11111111-1111-4111-8111-111111111111", product = "22222222-2222-4222-8222-222222222222";
    const rows: Record<string, unknown> = {
      digital_products: { id: product, organization_id: org, status: "published", file_path: `${org}/${product}/main.pdf`, file_name: "main.pdf" },
      digital_orders: { id: "33333333-3333-4333-8333-333333333333", product_id: product, organization_id: org, status: fixture.status, access_token: "a".repeat(48) },
      digital_order_claims: fixture.owner ? { user_id: fixture.owner } : null,
      digital_resources: { organization_id: org, lesson_id: "lesson", file_path: `${org}/${product}/video.mp4`, file_name: "video.mp4" },
      digital_lessons: { is_free: fixture.free, is_published: fixture.published },
    };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: rows[table], error: null }) };
    return q;
  },
} }));
import "@/routes/api/digital-content";
const url = (resource = "main") => `http://localhost:8080/api/digital-content?product=22222222-2222-4222-8222-222222222222&o=33333333-3333-4333-8333-333333333333&resource=${resource}&t=${"a".repeat(48)}`;
async function download(link: string, user?: string) {
  if (!fixture.get) throw new Error("Missing handler");
  return fixture.get({ request: new Request(link, { headers: user ? { Authorization: `Bearer ${user}` } : {} }) });
}
beforeEach(() => {
  fixture.owner = null; fixture.status = "paid"; fixture.free = false; fixture.published = true;
  fixture.signed.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("private-file", { headers: { "Content-Type": "application/octet-stream" } })));
});
describe("actual download handler with isolated in-memory data", () => {
  it("streams an unclaimed purchase but revokes the same issued app URL after claim", async () => {
    const issued = url();
    expect((await download(issued)).status).toBe(200);
    fixture.owner = "owner";
    expect((await download(issued)).status).toBe(403);
    expect((await download(issued, "other")).status).toBe(403);
    expect((await download(issued, "owner")).status).toBe(200);
  });
  it("paid videos recheck identity while unpublished lessons stay inaccessible to everyone", async () => {
    fixture.owner = "owner";
    const video = url("44444444-4444-4444-8444-444444444444");
    expect((await download(video)).status).toBe(403);
    expect((await download(video, "other")).status).toBe(403);
    expect((await download(video, "owner")).status).toBe(200);
    fixture.published = false;
    expect((await download(video, "owner")).status).toBe(403);
  });
  it("never reveals the internal signed URL, uses 30 seconds internally, and disallows caching", async () => {
    const response = await download(url());
    expect(await response.text()).toBe("private-file");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fixture.signed).toHaveBeenCalledWith(expect.any(String), 30);
  });
  it("unpaid purchases cannot download even as the claimant", async () => {
    fixture.owner = "owner";
    for (const status of ["pending", "failed", "expired"]) {
      fixture.status = status;
      expect((await download(url(), "owner")).status).toBe(403);
    }
    expect(fixture.signed).not.toHaveBeenCalled();
  });
});