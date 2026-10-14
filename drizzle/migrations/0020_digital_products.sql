CREATE TABLE public.digital_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  cover_path text,
  file_path text,
  file_name text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.digital_products(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_products TO authenticated;
GRANT ALL ON public.digital_products TO service_role;
GRANT SELECT (id, organization_id, title, description, price, cover_path, status) ON public.digital_products TO anon;
ALTER TABLE public.digital_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop reads own digital products" ON public.digital_products FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "public reads published digital products" ON public.digital_products FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "shop admin inserts digital products" ON public.digital_products FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin updates digital products" ON public.digital_products FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin deletes digital products" ON public.digital_products FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

CREATE OR REPLACE FUNCTION public.digital_products_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.organization_id <> OLD.organization_id THEN RAISE EXCEPTION 'Interdit'; END IF;
  IF length(btrim(NEW.title)) = 0 OR length(NEW.title) > 200 THEN RAISE EXCEPTION 'Titre invalide'; END IF;
  IF length(NEW.description) > 5000 THEN RAISE EXCEPTION 'Description trop longue'; END IF;
  IF NEW.status = 'published' AND NEW.file_path IS NULL THEN RAISE EXCEPTION 'Ajoutez le fichier avant de publier'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER digital_products_guard BEFORE INSERT OR UPDATE ON public.digital_products FOR EACH ROW EXECUTE FUNCTION public.digital_products_guard();

CREATE POLICY "shop reads own digital files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('digital-files','digital-covers') AND (storage.foldername(name))[1] = public.current_shop()::text);
CREATE POLICY "shop admin uploads digital files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('digital-files','digital-covers') AND (storage.foldername(name))[1] = public.current_shop()::text AND public.is_shop_admin());
CREATE POLICY "shop admin updates digital files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('digital-files','digital-covers') AND (storage.foldername(name))[1] = public.current_shop()::text AND public.is_shop_admin());
CREATE POLICY "shop admin deletes digital files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('digital-files','digital-covers') AND (storage.foldername(name))[1] = public.current_shop()::text AND public.is_shop_admin());