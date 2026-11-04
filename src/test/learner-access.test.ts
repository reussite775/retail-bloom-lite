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
