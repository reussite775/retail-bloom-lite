// Share permanent published URLs, never the editor's authenticated preview origin.
const publicProductOrigin = "https://getcommercestream.app";

export function digitalProductLink(productId: string): string {
  return `${publicProductOrigin}/p/${encodeURIComponent(productId)}`;
}
export function creatorStoreLink(slug: string): string {
  return `${publicProductOrigin}/boutique/${encodeURIComponent(slug)}`;
}
