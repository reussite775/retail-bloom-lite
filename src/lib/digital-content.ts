// Pure helpers for creator content: resources, modules, lessons.

export const MAX_RESOURCE_BYTES = 50 * 1024 * 1024; // same 50 MB limit as the private files bucket

export type ResourceFormat = "pdf" | "document" | "image" | "video" | "audio" | "archive" | "link" | "file";

export const FORMAT_LABELS: Record<ResourceFormat, string> = {
  pdf: "PDF", document: "Document", image: "Image", video: "Vidéo", audio: "Audio", archive: "Archive ZIP", link: "Lien externe", file: "Fichier",
};

export function resourceFormat(r: { kind: string; mime_type?: string | null; file_name?: string | null; url?: string | null }): ResourceFormat {
  if (r.kind === "link") return /youtube\.com|youtu\.be|vimeo\.com/i.test(r.url ?? "") ? "video" : "link";
  const mime = (r.mime_type ?? "").toLowerCase();
  const ext = (r.file_name ?? "").toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (/zip|rar|7z|tar|gzip/.test(mime) || ["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (/word|document|sheet|excel|presentation|powerpoint|text|rtf|opendocument/.test(mime) || ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "odt", "rtf"].includes(ext)) return "document";
  return "file";
}

export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/** Returns an error message, or null when the external link is acceptable. */
export function validateLink(url: string): string | null {
  const u = url.trim();
  if (!u) return "Indiquez l'adresse du lien";
  if (u.length > 2000) return "Lien trop long";
  if (!/^https?:\/\/[^\s]+$/i.test(u)) return "Le lien doit commencer par https://";
  try { new URL(u); } catch { return "Lien invalide"; }
  return null;
}

export function validateUpload(file: { size: number }): string | null {
  if (file.size <= 0) return "Fichier vide";
  if (file.size > MAX_RESOURCE_BYTES) return "Fichier trop volumineux (50 Mo maximum)";
  return null;
}

type Positioned = { id: string; position: number };

/**
 * Moves the item at `index` by `dir` (-1 up, +1 down) and returns the position
 * updates needed so the stored order matches the new list (positions = 0..n-1).
 */
export function reorderUpdates<T extends Positioned>(list: T[], index: number, dir: -1 | 1): { id: string; position: number }[] {
  const target = index + dir;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next.map((x, i) => ({ id: x.id, position: i, old: x.position })).filter((u) => u.old !== u.position).map(({ id, position }) => ({ id, position }));
}

export const byPosition = <T extends { position: number; created_at?: string }>(a: T, b: T) =>
  a.position - b.position || (a.created_at ?? "").localeCompare(b.created_at ?? "");

export function programSummary(modules: unknown[], lessons: { is_free: boolean; is_published: boolean }[], resources: unknown[]) {
  return {
    modules: modules.length,
    lessons: lessons.length,
    free: lessons.filter((l) => l.is_free).length,
    unpublished: lessons.filter((l) => !l.is_published).length,
    resources: resources.length,
  };
}

/** Storage path of a resource file, always inside the shop folder required by storage rules. */
export function resourcePath(shopId: string, productId: string, fileName: string, now = Date.now(), rand = Math.random().toString(36).slice(2, 8)): string {
  const ext = fileName.includes(".") ? (fileName.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin" : "bin";
  return `${shopId}/${productId}/res-${now}-${rand}.${ext}`;
}
