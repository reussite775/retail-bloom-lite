CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_shop() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  fee numeric NOT NULL DEFAULT 0 CHECK (fee >= 0 AND fee <= 10000000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT ALL ON public.delivery_zones TO service_role;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop zones read" ON public.delivery_zones FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "admin zones insert" ON public.delivery_zones FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin() AND public.shop_has_premium(organization_id));
CREATE POLICY "admin zones update" ON public.delivery_zones FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop());
CREATE POLICY "admin zones delete" ON public.delivery_zones FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS delivery_zone text NOT NULL DEFAULT '' CHECK (length(delivery_zone) <= 80);
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0 AND delivery_fee <= 10000000);