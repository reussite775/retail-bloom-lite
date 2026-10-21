CREATE OR REPLACE FUNCTION public.public_digital_product_v2(_identifier text)
RETURNS TABLE(id uuid, title text, description text, price numeric, cover_path text, slug text, shop_name text, product_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.title, p.description, p.price, p.cover_path, p.slug, o.name, p.product_type
  FROM public.digital_products p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.status = 'published' AND (p.id::text = _identifier OR p.slug = _identifier)
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.public_digital_product_v2(text) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.public_digital_product(text) IS 'DEPRECATED: replaced by public_digital_product_v2 (adds product_type)';