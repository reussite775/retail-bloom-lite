-- Organizations (shops). id = owner's user id for existing shops, so existing shop-owned rows stay valid.
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'Ma boutique',
  slogan text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  subscription_active boolean NOT NULL DEFAULT false,
  subscription_ends_at timestamptz,
  plan text NOT NULL DEFAULT 'trial',
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.organizations (id, owner_id, name, slogan, contact, address, logo_url, trial_ends_at, subscription_active, subscription_ends_at, created_at)
SELECT p.id, p.id, p.shop_name, p.slogan, p.contact, p.address, p.logo_url, p.trial_ends_at, p.subscription_active, p.subscription_ends_at, p.created_at
FROM public.profiles p WHERE p.id NOT IN (SELECT user_id FROM public.shop_members);
GRANT SELECT ON public.organizations TO authenticated;
GRANT UPDATE (name, slogan, contact, address, logo_url) ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE,
  role public.shop_role NOT NULL DEFAULT 'cashier',
  email text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
INSERT INTO public.organization_members (organization_id, user_id, role, created_at)
SELECT id, owner_id, 'admin', created_at FROM public.organizations;
INSERT INTO public.organization_members (organization_id, user_id, role, email, display_name, created_at)
SELECT sm.shop_id, sm.user_id, sm.role, sm.email, sm.display_name, sm.created_at FROM public.shop_members sm
WHERE sm.shop_id IN (SELECT id FROM public.organizations) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.shop_members IS 'DEPRECATED: replaced by organization_members';

-- Profiles: account info + suspension (suspension only writable by service role)
ALTER TABLE public.profiles ADD COLUMN full_name text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN email text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN suspended_at timestamptz;
UPDATE public.profiles p SET email = COALESCE(u.email, ''), full_name = COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'display_name', '')
FROM auth.users u WHERE u.id = p.id;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
COMMENT ON COLUMN public.profiles.shop_name IS 'DEPRECATED: moved to organizations.name';
COMMENT ON COLUMN public.profiles.trial_ends_at IS 'DEPRECATED: moved to organizations';
COMMENT ON COLUMN public.profiles.subscription_active IS 'DEPRECATED: moved to organizations';
COMMENT ON COLUMN public.profiles.subscription_ends_at IS 'DEPRECATED: moved to organizations';

-- Tenant resolution: NULL for suspended or unattached users => every RLS check fails
CREATE OR REPLACE FUNCTION public.current_shop() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.organization_id FROM public.organization_members m
  WHERE m.user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_suspended)
  LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.is_shop_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = auth.uid() AND role = 'admin' AND organization_id = public.current_shop())
$$;
CREATE OR REPLACE FUNCTION public.has_access(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organizations WHERE id = _uid AND (
    (subscription_active AND (subscription_ends_at IS NULL OR subscription_ends_at > now())) OR trial_ends_at > now()))
$$;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'display_name', ''))
  ON CONFLICT DO NOTHING;
  IF COALESCE(NEW.raw_user_meta_data->>'shop_employee', '') <> 'true' THEN
    INSERT INTO public.organizations (id, owner_id) VALUES (NEW.id, NEW.id) ON CONFLICT DO NOTHING;
    INSERT INTO public.organization_members (organization_id, user_id, role, email) VALUES (NEW.id, NEW.id, 'admin', COALESCE(NEW.email, '')) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE POLICY "org members read" ON public.organizations FOR SELECT TO authenticated USING (id = public.current_shop());
CREATE POLICY "org admin update" ON public.organizations FOR UPDATE TO authenticated USING (id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (id = public.current_shop());
CREATE POLICY "members read self or team" ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (organization_id = public.current_shop() AND public.is_shop_admin()));

-- Bind every business table to its organization
COMMENT ON COLUMN public.products.user_id IS 'Organization id (organizations.id)';
COMMENT ON COLUMN public.sales.user_id IS 'Organization id (organizations.id)';
COMMENT ON COLUMN public.sale_items.user_id IS 'Organization id (organizations.id)';
COMMENT ON COLUMN public.customers.user_id IS 'Organization id (organizations.id)';
COMMENT ON COLUMN public.credit_payments.user_id IS 'Organization id (organizations.id)';
ALTER TABLE public.sales ALTER COLUMN user_id SET DEFAULT public.current_shop();
ALTER TABLE public.credit_payments ALTER COLUMN user_id SET DEFAULT public.current_shop();
ALTER TABLE public.products ADD CONSTRAINT products_org_fkey FOREIGN KEY (user_id) REFERENCES public.organizations(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.sales ADD CONSTRAINT sales_org_fkey FOREIGN KEY (user_id) REFERENCES public.organizations(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_org_fkey FOREIGN KEY (user_id) REFERENCES public.organizations(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.customers ADD CONSTRAINT customers_org_fkey FOREIGN KEY (user_id) REFERENCES public.organizations(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.credit_payments ADD CONSTRAINT credit_payments_org_fkey FOREIGN KEY (user_id) REFERENCES public.organizations(id) ON DELETE CASCADE NOT VALID;

DROP POLICY IF EXISTS "shop sale items read" ON public.sale_items;
CREATE POLICY "shop sale items read" ON public.sale_items FOR SELECT TO authenticated
  USING (user_id = public.current_shop() AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id));

-- Expenses (admin only: finances)
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_shop() REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'Autre',
  amount numeric NOT NULL CHECK (amount > 0),
  spent_on date NOT NULL DEFAULT current_date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin expenses read" ON public.expenses FOR SELECT TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "admin expenses insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin() AND public.has_access(public.current_shop()));
CREATE POLICY "admin expenses update" ON public.expenses FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop());
CREATE POLICY "admin expenses delete" ON public.expenses FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

-- Debts views (inherit RLS of underlying tables)
CREATE VIEW public.debts WITH (security_invoker = true) AS
  SELECT s.id, s.user_id AS organization_id, s.customer_id, s.total AS amount, s.seller_id, s.created_at FROM public.sales s WHERE s.is_credit;
CREATE VIEW public.debt_payments WITH (security_invoker = true) AS
  SELECT cp.id, cp.user_id AS organization_id, cp.customer_id, cp.amount, cp.created_at FROM public.credit_payments cp;
GRANT SELECT ON public.debts, public.debt_payments TO authenticated;
GRANT ALL ON public.debts, public.debt_payments TO service_role;
