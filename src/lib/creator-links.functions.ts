import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { validPublicSlug } from './public-slugs';
export const checkCreatorSlug = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { kind: 'product' | 'store'; slug: string; productId?: string }) => data)
  .handler(async ({ data, context }) => {
    if (!validPublicSlug(data.slug)) return false;
    const { data: available, error } = await context.supabase.rpc('creator_slug_available', { _kind: data.kind, _slug: data.slug, _product_id: data.productId });
    if (error) throw new Error('Impossible de vérifier ce nom public.');
    return available;
  });
export const saveCreatorStore = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { slug: string }) => { if (!validPublicSlug(data.slug)) throw new Error('Nom public invalide ou réservé.'); return data; })
  .handler(async ({ data, context }) => {
    const { data: shopId, error: shopError } = await context.supabase.rpc('current_shop');
    if (shopError || !shopId) throw new Error('Accès refusé.');
    const { error } = await context.supabase.from('creator_storefronts').upsert({ organization_id: shopId, slug: data.slug }, { onConflict: 'organization_id' });
    if (error) throw new Error(error.code === '23505' ? 'Ce nom est déjà utilisé.' : 'Impossible d’enregistrer le lien de boutique.');
    return data.slug;
  });
