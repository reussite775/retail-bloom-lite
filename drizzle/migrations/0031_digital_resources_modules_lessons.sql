-- Modules d'une formation
CREATE TABLE public.digital_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.digital_products(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_modules_title_len CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT digital_modules_desc_len CHECK (length(description) <= 2000)
);
CREATE INDEX digital_modules_product_idx ON public.digital_modules (product_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_modules TO authenticated;
GRANT ALL ON public.digital_modules TO service_role;
ALTER TABLE public.digital_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop reads own digital modules" ON public.digital_modules FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "shop admin inserts digital modules" ON public.digital_modules FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin updates digital modules" ON public.digital_modules FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin deletes digital modules" ON public.digital_modules FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

-- Leçons d'un module (is_free : gratuite / réservée aux acheteurs ; is_published prépare les contenus non encore publiés)
CREATE TABLE public.digital_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.digital_products(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.digital_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_free boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_lessons_title_len CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT digital_lessons_content_len CHECK (length(content) <= 50000)
);
CREATE INDEX digital_lessons_module_idx ON public.digital_lessons (module_id, position);
CREATE INDEX digital_lessons_product_idx ON public.digital_lessons (product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_lessons TO authenticated;
GRANT ALL ON public.digital_lessons TO service_role;
ALTER TABLE public.digital_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop reads own digital lessons" ON public.digital_lessons FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "shop admin inserts digital lessons" ON public.digital_lessons FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin updates digital lessons" ON public.digital_lessons FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin deletes digital lessons" ON public.digital_lessons FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

-- Ressources : rattachées au produit (lesson_id NULL) ou à une leçon ; fichier privé (bucket digital-files) ou lien externe
CREATE TABLE public.digital_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.digital_products(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.digital_lessons(id) ON DELETE CASCADE,
  kind text NOT NULL,
  role text NOT NULL DEFAULT 'main',
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  file_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  url text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_resources_kind CHECK (kind IN ('file', 'link')),
  CONSTRAINT digital_resources_role CHECK (role IN ('main', 'bonus')),
  CONSTRAINT digital_resources_name_len CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT digital_resources_desc_len CHECK (length(description) <= 1000),
  CONSTRAINT digital_resources_size CHECK (size_bytes IS NULL OR (size_bytes >= 0 AND size_bytes <= 52428800)),
  CONSTRAINT digital_resources_payload CHECK (
    (kind = 'file' AND file_path IS NOT NULL AND url IS NULL)
    OR (kind = 'link' AND url IS NOT NULL AND file_path IS NULL AND url ~* '^https?://[^\s]+$' AND length(url) <= 2000)
  )
);
CREATE INDEX digital_resources_product_idx ON public.digital_resources (product_id, lesson_id, position);
CREATE INDEX digital_resources_lesson_idx ON public.digital_resources (lesson_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_resources TO authenticated;
GRANT ALL ON public.digital_resources TO service_role;
ALTER TABLE public.digital_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop reads own digital resources" ON public.digital_resources FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "shop admin inserts digital resources" ON public.digital_resources FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin updates digital resources" ON public.digital_resources FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin deletes digital resources" ON public.digital_resources FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

-- Garde-fous : même boutique, rattachements cohérents, fichier rangé dans le dossier de la boutique
CREATE OR REPLACE FUNCTION public.digital_content_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND (NEW.organization_id <> OLD.organization_id OR NEW.product_id <> OLD.product_id) THEN RAISE EXCEPTION 'Interdit'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.digital_products p WHERE p.id = NEW.product_id AND p.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;
  IF TG_TABLE_NAME = 'digital_lessons' THEN
    IF NOT EXISTS (SELECT 1 FROM public.digital_modules m WHERE m.id = NEW.module_id AND m.product_id = NEW.product_id) THEN RAISE EXCEPTION 'Module introuvable'; END IF;
  ELSIF TG_TABLE_NAME = 'digital_resources' THEN
    IF NEW.lesson_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.digital_lessons l WHERE l.id = NEW.lesson_id AND l.product_id = NEW.product_id) THEN RAISE EXCEPTION 'Leçon introuvable'; END IF;
    IF NEW.file_path IS NOT NULL AND split_part(NEW.file_path, '/', 1) <> NEW.organization_id::text THEN RAISE EXCEPTION 'Fichier invalide'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER digital_modules_guard BEFORE INSERT OR UPDATE ON public.digital_modules FOR EACH ROW EXECUTE FUNCTION public.digital_content_guard();
CREATE TRIGGER digital_lessons_guard BEFORE INSERT OR UPDATE ON public.digital_lessons FOR EACH ROW EXECUTE FUNCTION public.digital_content_guard();
CREATE TRIGGER digital_resources_guard BEFORE INSERT OR UPDATE ON public.digital_resources FOR EACH ROW EXECUTE FUNCTION public.digital_content_guard();