const reserved = new Set(['admin','api','auth','login','logout','signup','register','studio','dashboard','produits','products','boutique','boutiques','support','settings','parametres','p','www','gestipro','null','undefined','reset-password']);
export function validPublicSlug(value: string) {
  return /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(value) && !value.includes('--') && !reserved.has(value) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
export function suggestedSlug(value: string) {
  const slug = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/g, '');
  return validPublicSlug(slug) ? slug : 'produit';
}
