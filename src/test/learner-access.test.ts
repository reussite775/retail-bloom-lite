import { describe, it, expect } from "vitest";
import { canOpenLesson, mergePurchases, orderUnlocks, progressStats, resumeLesson, videoEmbedUrl } from "@/lib/learner-access";

describe("canOpenLesson", () => {
  const free = { is_free: true, is_published: true };
  const paid = { is_free: false, is_published: true };
  const hidden = { is_free: true, is_published: false };
  it("buyer opens free and paid published lessons", () => {
    expect(canOpenLesson(free, { purchased: true, productPublished: true })).toBe(true);
    expect(canOpenLesson(paid, { purchased: true, productPublished: false })).toBe(true);
  });
  it("visitor opens only free lessons of a product on sale", () => {
    expect(canOpenLesson(free, { purchased: false, productPublished: true })).toBe(true);
    expect(canOpenLesson(paid, { purchased: false, productPublished: true })).toBe(false);
    expect(canOpenLesson(free, { purchased: false, productPublished: false })).toBe(false);
  });
  it("nobody opens an unpublished lesson", () => {
    expect(canOpenLesson(hidden, { purchased: true, productPublished: true })).toBe(false);
    expect(canOpenLesson(hidden, { purchased: false, productPublished: true })).toBe(false);
  });
});

describe("orderUnlocks", () => {
  const order = { access_token: "abcdef0123456789", status: "paid", product_id: "p1" };
  it("needs the exact token, paid status and same product", () => {
    expect(orderUnlocks(order, "abcdef0123456789", "p1")).toBe(true);
    expect(orderUnlocks(order, "abcdef0123456780", "p1")).toBe(false);
    expect(orderUnlocks(order, undefined, "p1")).toBe(false);
    expect(orderUnlocks({ ...order, status: "pending" }, "abcdef0123456789", "p1")).toBe(false);
    expect(orderUnlocks(order, "abcdef0123456789", "other-shop-product")).toBe(false);
    expect(orderUnlocks(null, "abcdef0123456789", "p1")).toBe(false);
  });
  it("revokes a claimed secret link and accepts only its authenticated owner on either device", () => {
    expect(orderUnlocks(order, order.access_token, "p1", "owner", null)).toBe(false);
    expect(orderUnlocks(order, order.access_token, "p1", "owner", "other")).toBe(false);
    for (const device of ["phone", "computer"]) {
      expect(orderUnlocks(order, undefined, "p1", "owner", "owner"), device).toBe(true);
    }
    expect(orderUnlocks({ ...order, status: "pending" }, undefined, "p1", "owner", "owner")).toBe(false);
  });
});

describe("videoEmbedUrl", () => {
  it("embeds YouTube and Vimeo only", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=3")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(videoEmbedUrl("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbedUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("progress and resume", () => {
  const lessons = [{ id: "a", module_id: "m1" }, { id: "b", module_id: "m1" }, { id: "c", module_id: "m2" }];
  it("computes lessons and modules done", () => {
    expect(progressStats(lessons, new Set(["a", "b"]))).toEqual({ done: 2, total: 3, percent: 67, modulesDone: 1, modulesTotal: 2 });
  });
  it("resumes at the last viewed lesson, else first unfinished", () => {
    const ordered = [{ id: "a", open: true }, { id: "b", open: true }, { id: "c", open: false }];
    expect(resumeLesson(ordered, "b", new Set())).toBe("b");
    expect(resumeLesson(ordered, "c", new Set(["a"]))).toBe("b");
    expect(resumeLesson(ordered, null, new Set(["a", "b"]))).toBe("a");
  });
  it("keeps purchases unique, newest first", () => {
    expect(mergePurchases([{ id: "1", t: "x" }, { id: "2", t: "y" }], { id: "2", t: "y" })).toEqual([{ id: "2", t: "y" }, { id: "1", t: "x" }]);
  });
});

import { ownsOrder } from "@/lib/learner-access";
describe("ownsOrder (Mes achats)", () => {
  const me = { id: "u1", email: "Client@Mail.com", emailVerified: true };
  it("matches a paid order by verified e-mail, case-insensitive", () => {
    expect(ownsOrder({ status: "paid", buyer_email: "client@mail.com ", claimedBy: null }, me)).toBe(true);
  });
  it("never shows unpaid orders", () => {
    expect(ownsOrder({ status: "pending", buyer_email: "client@mail.com", claimedBy: null }, me)).toBe(false);
    expect(ownsOrder({ status: "failed", buyer_email: "client@mail.com", claimedBy: "u1" }, me)).toBe(false);
  });
  it("ignores e-mail match when the e-mail is not verified", () => {
    expect(ownsOrder({ status: "paid", buyer_email: "client@mail.com", claimedBy: null }, { ...me, emailVerified: false })).toBe(false);
  });
  it("a claim by another client wins over the e-mail match", () => {
    expect(ownsOrder({ status: "paid", buyer_email: "client@mail.com", claimedBy: "u2" }, me)).toBe(false);
    expect(ownsOrder({ status: "paid", buyer_email: "", claimedBy: "u1" }, me)).toBe(true);
  });
  it("other clients' orders and orders without e-mail are not shown", () => {
    expect(ownsOrder({ status: "paid", buyer_email: "autre@mail.com", claimedBy: null }, me)).toBe(false);
    expect(ownsOrder({ status: "paid", buyer_email: "", claimedBy: null }, me)).toBe(false);
  });
});

import { claimDecision, safeEqual } from "@/lib/learner-access";
describe("claimDecision (rattachement d'un achat)", () => {
  const tok = "a".repeat(48);
  const me = { id: "u1", email: "client@mail.com", emailVerified: true };
  const paid = (buyer_email: string | null) => ({ access_token: tok, status: "paid", buyer_email });
  it("an order without e-mail can be attached with its exact secret link", () => {
    expect(claimDecision(paid(""), tok, null, me)).toBe("ok");
    expect(claimDecision(paid(null), tok, null, { ...me, email: null, emailVerified: false })).toBe("ok");
  });
  it("wrong or truncated link, unpaid or unknown order are refused", () => {
    expect(claimDecision(paid(""), "b".repeat(48), null, me)).toBe("invalid");
    expect(claimDecision(paid(""), tok.slice(0, 40), null, me)).toBe("invalid");
    expect(claimDecision({ ...paid(""), status: "pending" }, tok, null, me)).toBe("invalid");
    expect(claimDecision(null, tok, null, me)).toBe("invalid");
  });
  it("an order already attached to another client cannot be claimed", () => {
    expect(claimDecision(paid(""), tok, "u2", me)).toBe("taken");
    expect(claimDecision(paid("client@mail.com"), tok, "u2", me)).toBe("taken");
    expect(claimDecision(paid(""), tok, "u1", me)).toBe("already_mine");
  });
  it("a forwarded link cannot take an order bought with someone else's e-mail", () => {
    expect(claimDecision(paid("acheteur@mail.com"), tok, null, me)).toBe("other_email");
    expect(claimDecision(paid("client@mail.com"), tok, null, { ...me, emailVerified: false })).toBe("other_email");
    expect(claimDecision(paid(" Client@Mail.com "), tok, null, me)).toBe("ok");
  });
  it("safeEqual compares secrets exactly", () => {
    expect(safeEqual(tok, tok)).toBe(true);
    expect(safeEqual(tok, tok + "a")).toBe(false);
    expect(safeEqual(tok, undefined)).toBe(false);
    expect(orderUnlocks({ access_token: tok, status: "paid", product_id: "p" }, tok.toUpperCase(), "p")).toBe(false);
  });
});
