ALTER TABLE public.digital_products ADD COLUMN page_config jsonb;

COMMENT ON COLUMN public.digital_products.page_config IS 'Sections de la page de vente (avantages, contenu inclus, FAQ, témoignages, libellé du bouton). NULL = page classique.';

CREATE OR REPLACE FUNCTION public.public_digital_product_v3(_identifier text)
RETURNS TABLE(id uuid, title text, description text, price numeric, cover_path text, slug text, shop_name text, product_type text, page_config jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.title, p.description, p.price, p.cover_path, p.slug, o.name, p.product_type, p.page_config
  FROM public.digital_products p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.status = 'published' AND (p.id::text = _identifier OR p.slug = _identifier)
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.public_digital_product_v3(text) TO anon;
GRANT EXECUTE ON FUNCTION public.public_digital_product_v3(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_digital_product_v3(text) TO service_role;