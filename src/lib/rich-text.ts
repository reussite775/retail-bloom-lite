// Sanitisation légère des descriptions enrichies (titres, gras, listes, liens).
// Utilisée à l'enregistrement (avec DOMPurify côté navigateur) et au rendu public.
const ALLOWED_TAGS = /<\/?(h2|h3|p|strong|b|em|ul|ol|li|a|br|span)(\s[^>]*)?>/gi;

export function sanitizeRichText(html: string): string {
  if (!html) return "";
  let out = html.replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  // Supprime toute balise non autorisée en gardant son contenu texte.
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>/g, (m, tag) => {
    const t = String(tag).toLowerCase();
    return ["h2", "h3", "p", "strong", "b", "em", "ul", "ol", "li", "a", "br", "span"].includes(t) ? m : "";
  });
  // Nettoie les attributs : seul href http(s)/mailto est conservé sur les liens.
  out = out.replace(/<a(\s[^>]*)?>/gi, (m) => {
    const href = /href\s*=\s*"(https?:\/\/[^"]*|mailto:[^"]*)"/i.exec(m)?.[1];
    return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : "<a>";
  });
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  out = out.replace(/javascript\s*:/gi, "");
  return out.trim();
}

export function isRichHtml(text: string): boolean {
  return /<\/?(h2|h3|p|strong|b|em|ul|ol|li|a|br)\b/i.test(text);
}
