import { describe, it, expect } from "vitest";
import { MAX_RESOURCE_BYTES, programSummary, reorderUpdates, resourceFormat, resourcePath, validateLink, validateUpload } from "@/lib/digital-content";

const list = [{ id: "a", position: 0 }, { id: "b", position: 1 }, { id: "c", position: 2 }];

describe("reorderUpdates", () => {
  it("moves an item down and only rewrites changed positions", () => {
    expect(reorderUpdates(list, 0, 1)).toEqual([{ id: "b", position: 0 }, { id: "a", position: 1 }]);
  });
  it("moves an item up", () => {
    expect(reorderUpdates(list, 2, -1)).toEqual([{ id: "c", position: 1 }, { id: "b", position: 2 }]);
  });
  it("does nothing past the edges", () => {
    expect(reorderUpdates(list, 0, -1)).toEqual([]);
    expect(reorderUpdates(list, 2, 1)).toEqual([]);
  });
  it("normalises gaps in stored positions", () => {
    const gappy = [{ id: "a", position: 0 }, { id: "b", position: 5 }, { id: "c", position: 9 }];
    expect(reorderUpdates(gappy, 1, -1)).toEqual([{ id: "b", position: 0 }, { id: "a", position: 1 }, { id: "c", position: 2 }]);
  });
});

describe("resource limits and validation", () => {
  it("keeps the 50 MB file limit", () => {
    expect(MAX_RESOURCE_BYTES).toBe(52428800);
    expect(validateUpload({ size: 52428800 })).toBeNull();
    expect(validateUpload({ size: 52428801 })).toMatch(/50 Mo/);
    expect(validateUpload({ size: 0 })).not.toBeNull();
  });
  it("accepts only http(s) links", () => {
    expect(validateLink("https://youtu.be/abc")).toBeNull();
    expect(validateLink("javascript:alert(1)")).not.toBeNull();
    expect(validateLink("ftp://x.com/a")).not.toBeNull();
    expect(validateLink("")).not.toBeNull();
  });
  it("detects formats", () => {
    expect(resourceFormat({ kind: "file", mime_type: "application/pdf" })).toBe("pdf");
    expect(resourceFormat({ kind: "file", file_name: "pack.zip" })).toBe("archive");
    expect(resourceFormat({ kind: "file", mime_type: "video/mp4" })).toBe("video");
    expect(resourceFormat({ kind: "file", mime_type: "image/png" })).toBe("image");
    expect(resourceFormat({ kind: "link", url: "https://www.youtube.com/watch?v=1" })).toBe("video");
    expect(resourceFormat({ kind: "link", url: "https://drive.google.com/x" })).toBe("link");
  });
  it("stores files inside the shop/product folder", () => {
    expect(resourcePath("shop", "prod", "Mon Guide.PDF", 1, "abc")).toBe("shop/prod/res-1-abc.pdf");
  });
});

describe("programSummary", () => {
  it("counts modules, lessons, free and unpublished lessons", () => {
    const s = programSummary([1, 2], [{ is_free: true, is_published: true }, { is_free: false, is_published: false }, { is_free: false, is_published: true }], [1]);
    expect(s).toEqual({ modules: 2, lessons: 3, free: 1, unpublished: 1, resources: 1 });
  });
});
