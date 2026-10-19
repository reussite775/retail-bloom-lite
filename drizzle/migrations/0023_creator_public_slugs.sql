ALTER TABLE public.digital_products ADD COLUMN slug text;
CREATE UNIQUE INDEX digital_products_slug_unique ON public.digital_products(slug);
CREATE FUNCTION public.valid_public_slug(_slug text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT _slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' AND _slug !~ '--' AND _slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND _slug <> ALL(ARRAY['admin','api','auth','login','logout','signup','register','studio','dashboard','produits','products','boutique','boutiques','support','settings','parametres','p','www','gestipro','null','undefined','reset-password']); $$;
CREATE FUNCTION public.digital_slug_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE base text; candidate text; suffix integer := 0;
BEGIN
 IF NEW.slug IS NULL THEN
  base := left(trim(both '-' from regexp_replace(lower(translate(NEW.title,'àâäéèêëîïôöùûüç','aaaeeeeiioouuuc')), '[^a-z0-9]+', '-', 'g')),48);
  IF length(base)<3 OR NOT public.valid_public_slug(base) THEN base := 'produit'; END IF;
  candidate := base;
  WHILE EXISTS(SELECT 1 FROM public.digital_products WHERE slug=candidate AND id<>NEW.id) LOOP suffix:=suffix+1; candidate:=base||'-'||suffix; END LOOP;
  NEW.slug:=candidate;
 END IF;
 IF NOT public.valid_public_slug(NEW.slug) THEN RAISE EXCEPTION 'Nom public invalide ou réservé'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER digital_slug_validation BEFORE INSERT OR UPDATE OF slug ON public.digital_products FOR EACH ROW EXECUTE FUNCTION public.digital_slug_guard();
UPDATE public.digital_products SET slug = NULL WHERE slug IS NULL;
CREATE TABLE public.creator_storefronts (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 slug text NOT NULL UNIQUE,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.creator_storefronts TO authenticated;
GRANT ALL ON public.creator_storefronts TO service_role;
ALTER TABLE public.creator_storefronts ENABLE ROW LEVEL SECURITY;
CREATE POLICY creator_store_read ON public.creator_storefronts FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY creator_store_insert ON public.creator_storefronts FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin() AND EXISTS(SELECT 1 FROM public.organizations WHERE id=organization_id AND account_type='digital'));
CREATE POLICY creator_store_update ON public.creator_storefronts FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin() AND EXISTS(SELECT 1 FROM public.organizations WHERE id=organization_id AND account_type='digital'));
CREATE FUNCTION public.storefront_slug_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN IF NOT public.valid_public_slug(NEW.slug) THEN RAISE EXCEPTION 'Nom public invalide ou réservé'; END IF; NEW.updated_at:=now(); RETURN NEW; END $$;
CREATE TRIGGER storefront_slug_validation BEFORE INSERT OR UPDATE ON public.creator_storefronts FOR EACH ROW EXECUTE FUNCTION public.storefront_slug_guard();
CREATE FUNCTION public.creator_slug_available(_kind text, _slug text, _product_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_shop_admin() OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=public.current_shop() AND account_type='digital') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 IF NOT public.valid_public_slug(_slug) THEN RETURN false; END IF;
 IF _kind='product' THEN
  IF _product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.digital_products WHERE id=_product_id AND organization_id=public.current_shop()) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN NOT EXISTS(SELECT 1 FROM public.digital_products WHERE slug=_slug AND (_product_id IS NULL OR id<>_product_id));
 ELSIF _kind='store' THEN
  RETURN NOT EXISTS(SELECT 1 FROM public.creator_storefronts WHERE slug=_slug AND organization_id<>public.current_shop());
 END IF;
 RAISE EXCEPTION 'Type invalide';
END $$;
REVOKE ALL ON FUNCTION public.creator_slug_available(text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creator_slug_available(text,text,uuid) TO authenticated;
CREATE FUNCTION public.public_digital_product(_identifier text) RETURNS TABLE(id uuid,title text,description text,price numeric,cover_path text,slug text,shop_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p.id,p.title,p.description,p.price,p.cover_path,p.slug,o.name FROM public.digital_products p JOIN public.organizations o ON o.id=p.organization_id WHERE p.status='published' AND (p.id::text=_identifier OR p.slug=_identifier) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.public_digital_product(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_digital_product(text) TO anon, authenticated, service_role;
CREATE FUNCTION public.public_creator_store(_slug text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('name',o.name,'slug',s.slug,'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'slug',p.slug,'title',p.title,'description',p.description,'price',p.price,'cover_path',p.cover_path) ORDER BY p.created_at DESC) FROM public.digital_products p WHERE p.organization_id=s.organization_id AND p.status='published'),'[]'::jsonb)) FROM public.creator_storefronts s JOIN public.organizations o ON o.id=s.organization_id WHERE s.slug=_slug;
$$;
REVOKE ALL ON FUNCTION public.public_creator_store(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_creator_store(text) TO anon, authenticated, service_role;