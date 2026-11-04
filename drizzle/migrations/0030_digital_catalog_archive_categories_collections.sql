-- Archivage : nouveau statut 'archived' (les produits archivés ne sont ni publics ni achetables, rien n'est supprimé)
ALTER TABLE public.digital_products DROP CONSTRAINT digital_products_status_check;
ALTER TABLE public.digital_products ADD CONSTRAINT digital_products_status_check CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]));

-- Catégories
CREATE TABLE public.digital_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_categories_name_len CHECK (length(btrim(name)) BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX digital_categories_org_name ON public.digital_categories (organization_id, lower(btrim(name)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_categories TO authenticated;
GRANT ALL ON public.digital_categories TO service_role;
ALTER TABLE public.digital_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop reads own digital categories" ON public.digital_categories FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "shop admin inserts digital categories" ON public.digital_categories FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin updates digital categories" ON public.digital_categories FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin deletes digital categories" ON public.digital_categories FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

-- Un produit peut avoir une catégorie ; supprimer la catégorie ne supprime pas le produit
ALTER TABLE public.digital_products ADD COLUMN category_id uuid REFERENCES public.digital_categories(id) ON DELETE SET NULL;
CREATE INDEX digital_products_category_idx ON public.digital_products (category_id);

-- Collections
CREATE TABLE public.digital_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_collections_name_len CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT digital_collections_desc_len CHECK (length(description) <= 1000)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_collections TO authenticated;
GRANT ALL ON public.digital_collections TO service_role;
ALTER TABLE public.digital_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop reads own digital collections" ON public.digital_collections FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "shop admin inserts digital collections" ON public.digital_collections FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin updates digital collections" ON public.digital_collections FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin deletes digital collections" ON public.digital_collections FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

CREATE TABLE public.digital_collection_items (
  collection_id uuid NOT NULL REFERENCES public.digital_collections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.digital_products(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX digital_collection_items_product_idx ON public.digital_collection_items (product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_collection_items TO authenticated;
GRANT ALL ON public.digital_collection_items TO service_role;
ALTER TABLE public.digital_collection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop reads own collection items" ON public.digital_collection_items FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "shop admin inserts collection items" ON public.digital_collection_items FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin updates collection items" ON public.digital_collection_items FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin deletes collection items" ON public.digital_collection_items FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

-- Garde-fous d'isolation : catégorie, collection et produit doivent appartenir à la même boutique
CREATE OR REPLACE FUNCTION public.digital_catalog_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'digital_products' THEN
    IF NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.digital_categories c WHERE c.id = NEW.category_id AND c.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'Catégorie introuvable';
    END IF;
  ELSIF TG_TABLE_NAME = 'digital_collection_items' THEN
    IF NOT EXISTS (SELECT 1 FROM public.digital_collections c WHERE c.id = NEW.collection_id AND c.organization_id = NEW.organization_id)
       OR NOT EXISTS (SELECT 1 FROM public.digital_products p WHERE p.id = NEW.product_id AND p.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'Collection ou produit introuvable';
    END IF;
  ELSIF TG_TABLE_NAME = 'digital_collections' THEN
    NEW.updated_at := now();
    IF TG_OP = 'UPDATE' AND NEW.organization_id <> OLD.organization_id THEN RAISE EXCEPTION 'Interdit'; END IF;
  ELSIF TG_TABLE_NAME = 'digital_categories' THEN
    IF TG_OP = 'UPDATE' AND NEW.organization_id <> OLD.organization_id THEN RAISE EXCEPTION 'Interdit'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER digital_products_category_guard BEFORE INSERT OR UPDATE OF category_id ON public.digital_products FOR EACH ROW EXECUTE FUNCTION public.digital_catalog_guard();
CREATE TRIGGER digital_collection_items_guard BEFORE INSERT OR UPDATE ON public.digital_collection_items FOR EACH ROW EXECUTE FUNCTION public.digital_catalog_guard();
CREATE TRIGGER digital_collections_guard BEFORE INSERT OR UPDATE ON public.digital_collections FOR EACH ROW EXECUTE FUNCTION public.digital_catalog_guard();
CREATE TRIGGER digital_categories_guard BEFORE INSERT OR UPDATE ON public.digital_categories FOR EACH ROW EXECUTE FUNCTION public.digital_catalog_guard();