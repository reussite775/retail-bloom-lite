CREATE TYPE public.app_role AS ENUM ('super_admin');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz;

CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 0),
  method text NOT NULL DEFAULT 'Mobile Money',
  note text NOT NULL DEFAULT '',
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.subscription_payments TO service_role;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin read payments" ON public.subscription_payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
GRANT SELECT ON public.subscription_payments TO authenticated;

CREATE OR REPLACE FUNCTION public.has_access(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND (
    (subscription_active AND (subscription_ends_at IS NULL OR subscription_ends_at > now()))
    OR trial_ends_at > now()))
$$;