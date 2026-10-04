CREATE TABLE public.payment_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  plan text NOT NULL,
  billing text NOT NULL,
  months int NOT NULL,
  amount numeric NOT NULL,
  provider text NOT NULL DEFAULT 'bkapay',
  provider_ref text,
  status text NOT NULL DEFAULT 'pending',
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CONSTRAINT payment_checkouts_plan_chk CHECK (plan IN ('standard','premium')),
  CONSTRAINT payment_checkouts_status_chk CHECK (status IN ('pending','paid','failed','cancelled'))
);
GRANT SELECT ON public.payment_checkouts TO authenticated;
GRANT ALL ON public.payment_checkouts TO service_role;
ALTER TABLE public.payment_checkouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop admin read checkouts" ON public.payment_checkouts FOR SELECT TO authenticated
  USING (organization_id = public.current_shop() AND public.is_shop_admin());

-- Idempotent activation, callable only by service role (webhook / admin server fns)
CREATE OR REPLACE FUNCTION public.mark_checkout_paid(_checkout uuid, _provider_ref text, _event jsonb, _method text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.payment_checkouts%ROWTYPE; o public.organizations%ROWTYPE; base timestamptz;
BEGIN
  SELECT * INTO c FROM public.payment_checkouts WHERE id = _checkout FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;
  IF c.status = 'paid' THEN RETURN false; END IF;
  SELECT * INTO o FROM public.organizations WHERE id = c.organization_id FOR UPDATE;
  base := CASE WHEN o.subscription_active AND o.subscription_ends_at > now() THEN o.subscription_ends_at ELSE now() END;
  UPDATE public.organizations SET subscription_active = true, plan = c.plan,
    subscription_ends_at = base + make_interval(months => c.months) WHERE id = c.organization_id;
  UPDATE public.payment_checkouts SET status = 'paid', paid_at = now(),
    provider_ref = COALESCE(_provider_ref, provider_ref), raw_event = _event WHERE id = c.id;
  INSERT INTO public.subscription_payments (shop_id, amount, method, note)
    VALUES (c.organization_id, c.amount, _method, initcap(c.plan) || ' · ' || c.months || ' mois · ' || COALESCE(_provider_ref, c.id::text));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.mark_checkout_paid(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_checkout_paid(uuid, text, jsonb, text) TO service_role;