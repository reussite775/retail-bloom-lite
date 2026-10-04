ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS business_mode text NOT NULL DEFAULT 'physical';
ALTER TABLE public.organizations ADD CONSTRAINT organizations_business_mode_chk CHECK (business_mode IN ('physical','online'));
GRANT UPDATE (business_mode) ON public.organizations TO authenticated;

CREATE OR REPLACE FUNCTION public.shop_has_premium(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org AND (o.trial_ends_at > now()
    OR (o.subscription_active AND o.plan = 'premium' AND (o.subscription_ends_at IS NULL OR o.subscription_ends_at > now()))))
$$;
REVOKE ALL ON FUNCTION public.shop_has_premium(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shop_has_premium(uuid) TO authenticated;

CREATE TABLE public.couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_shop() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 30),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop couriers read" ON public.couriers FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "shop couriers insert" ON public.couriers FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.shop_has_premium(organization_id));
CREATE POLICY "shop couriers update" ON public.couriers FOR UPDATE TO authenticated USING (organization_id = public.current_shop()) WITH CHECK (organization_id = public.current_shop() AND public.shop_has_premium(organization_id));
CREATE POLICY "admin couriers delete" ON public.couriers FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

CREATE TABLE public.online_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_shop() REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 100),
  customer_phone text NOT NULL DEFAULT '' CHECK (length(customer_phone) <= 30),
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','tiktok','instagram')),
  items text NOT NULL CHECK (length(btrim(items)) BETWEEN 1 AND 500),
  amount numeric NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  status text NOT NULL DEFAULT 'awaiting_deposit' CHECK (status IN ('awaiting_deposit','ready','delivering','delivered','cancelled')),
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  cash_collected numeric NOT NULL DEFAULT 0 CHECK (cash_collected >= 0),
  remitted_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX online_orders_org_idx ON public.online_orders(organization_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_orders TO authenticated;
GRANT ALL ON public.online_orders TO service_role;
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop orders read" ON public.online_orders FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "shop orders insert" ON public.online_orders FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.shop_has_premium(organization_id));
CREATE POLICY "shop orders update" ON public.online_orders FOR UPDATE TO authenticated USING (organization_id = public.current_shop()) WITH CHECK (organization_id = public.current_shop() AND public.shop_has_premium(organization_id));
CREATE POLICY "admin orders delete" ON public.online_orders FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

CREATE OR REPLACE FUNCTION public.online_orders_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.courier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = NEW.courier_id AND c.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Livreur introuvable';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.organization_id <> OLD.organization_id THEN RAISE EXCEPTION 'Interdit'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER online_orders_guard BEFORE INSERT OR UPDATE ON public.online_orders FOR EACH ROW EXECUTE FUNCTION public.online_orders_guard();