import { describe, it, expect } from 'vitest';
import { validPublicSlug, suggestedSlug } from '@/lib/public-slugs';
import { digitalProductLink, creatorStoreLink } from '@/lib/digital-links';
describe('Public creator names', () => {
  it('accepts readable product names', () => expect(validPublicSlug('100prieres')).toBe(true));
  it('rejects reserved names', () => expect(validPublicSlug('admin')).toBe(false));
  it('rejects unsupported characters', () => expect(validPublicSlug('école test')).toBe(false));
  it('rejects UUID names to keep old links unambiguous', () => expect(validPublicSlug('adb7d70b-c9d2-4563-bc6d-af0fdba4ddec')).toBe(false));
  it('generates readable names', () => expect(suggestedSlug('École de PRIÈRES !')).toBe('ecole-de-prieres'));
  it('does not generate a reserved name', () => expect(suggestedSlug('Admin')).toBe('produit'));
  it('keeps product links independent of shop renames', () => {
    expect(creatorStoreLink('mon-nom')).toBe('https://getcommercestream.app/boutique/mon-nom');
    expect(creatorStoreLink('nouveau-nom')).toBe('https://getcommercestream.app/boutique/nouveau-nom');
    expect(digitalProductLink('100prieres')).toBe('https://getcommercestream.app/p/100prieres');
  });
});
