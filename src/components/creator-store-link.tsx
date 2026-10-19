import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PublicSlugField } from './public-slug-field';
import { saveCreatorStore } from '@/lib/creator-links.functions';
export function CreatorStoreLink({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveCreatorStore);
  const query = useQuery({ queryKey: ['creator-store', shopId], queryFn: async () => { const { data, error } = await supabase.from('creator_storefronts').select('slug').eq('organization_id', shopId).maybeSingle(); if (error) throw error; return data; } });
  const [slug, setSlug] = useState('');
  const [available, setAvailable] = useState(false);
  useEffect(() => { setSlug(query.data?.slug ?? ''); }, [query.data]);
  const save = useMutation({ mutationFn: () => saveFn({ data: { slug } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['creator-store', shopId] }); toast.success('Lien de boutique enregistré'); }, onError: (e: Error) => toast.error(e.message) });
  return <section className="space-y-3 border-b pb-6">
    <h2 className="text-xl font-bold">Votre boutique publique</h2>
    {query.isError ? <p className="text-sm text-destructive">Impossible de charger le lien de boutique.</p> : <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PublicSlugField kind="store" value={slug} onChange={setSlug} onAvailability={setAvailable} />
      <Button type="submit" disabled={query.isPending || !available || save.isPending || slug === query.data?.slug}>{save.isPending ? 'Enregistrement…' : 'Enregistrer le lien de boutique'}</Button>
    </form>}
  </section>;
}
