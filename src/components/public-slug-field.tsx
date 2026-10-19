import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { checkCreatorSlug } from '@/lib/creator-links.functions';
import { validPublicSlug } from '@/lib/public-slugs';
import { creatorStoreLink, digitalProductLink } from '@/lib/digital-links';
export function PublicSlugField({ value, onChange, kind, productId, onAvailability }: { value: string; onChange: (v: string) => void; kind: 'product' | 'store'; productId?: string; onAvailability?: (v: boolean) => void }) {
  const check = useServerFn(checkCreatorSlug);
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), 350); return () => clearTimeout(timer); }, [value]);
  const valid = validPublicSlug(value);
  const query = useQuery({ queryKey: ['slug-available', kind, debounced, productId], queryFn: () => check({ data: { kind, slug: debounced, productId } }), enabled: validPublicSlug(debounced), staleTime: 0 });
  const available = valid && debounced === value && !query.isFetching && query.data === true;
  useEffect(() => { onAvailability?.(available); }, [available, onAvailability]);
  const link = kind === 'store' ? creatorStoreLink(value) : digitalProductLink(value);
  return <div className="space-y-2">
    <Label htmlFor={`slug-${kind}`}>{kind === 'store' ? 'Nom public de la boutique' : 'Nom public du produit'}</Label>
    <Input id={`slug-${kind}`} value={value} maxLength={64} onChange={(e) => onChange(e.target.value)} aria-invalid={!valid} />
    <p aria-live="polite" className={`text-xs ${available ? 'text-primary' : 'text-muted-foreground'}`}>
      {!valid ? '3 à 64 caractères : lettres minuscules, chiffres et tirets ; nom non réservé.' : query.isError ? 'Vérification impossible. Réessayez.' : debounced !== value || query.isFetching ? 'Vérification…' : available ? 'Nom disponible' : 'Ce nom est déjà utilisé.'}
    </p>
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 break-all text-xs text-muted-foreground">{link}</span>
      <Button type="button" size="icon" variant="ghost" aria-label={kind === 'store' ? 'Copier le lien de boutique' : 'Copier le lien du produit'} disabled={!available} onClick={async () => { try { await navigator.clipboard.writeText(link); toast.success('Lien copié'); } catch { toast.error('Copie impossible. Sélectionnez le lien.'); } }}><Copy className="h-4 w-4" /></Button>
    </div>
  </div>;
}
