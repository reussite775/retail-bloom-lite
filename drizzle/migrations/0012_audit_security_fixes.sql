-- 1. Merchants may only edit shop identity columns, never subscription fields
REVOKE UPDATE ON public.organizations FROM authenticated, anon;
GRANT UPDATE (name, slogan, contact, address, logo_url) ON public.organizations TO authenticated;

-- 4. No direct table access for signed-out visitors; drop writes that no policy allows
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.credit_payments, public.sales, public.sale_items, public.organization_members,
  public.platform_settings, public.subscription_payments, public.user_roles, public.shop_members, public.payment_checkouts,
  public.debts, public.debt_payments FROM authenticated;
REVOKE INSERT, DELETE ON public.organizations FROM authenticated;
REVOKE DELETE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.assistant_messages FROM authenticated;

-- 3. customer_debt only answers for the caller's own shop
CREATE OR REPLACE FUNCTION public.customer_debt(_cid uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.customers WHERE id = _cid AND user_id = public.current_shop())
    THEN COALESCE((SELECT sum(total) FROM public.sales WHERE customer_id = _cid AND is_credit), 0)
       - COALESCE((SELECT sum(amount) FROM public.credit_payments WHERE customer_id = _cid), 0)
    ELSE 0 END
$$;

-- 6. Cashiers lose access when the shop is neither Premium nor in trial; owners unaffected
CREATE OR REPLACE FUNCTION public.current_shop()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.organization_id FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_suspended)
    AND (m.role = 'admin' OR o.trial_ends_at > now()
         OR (o.subscription_active AND o.plan = 'premium' AND (o.subscription_ends_at IS NULL OR o.subscription_ends_at > now())))
  LIMIT 1
$$;

-- 3. Close internal functions to signed-out callers (and trigger-only fn to everyone)
REVOKE EXECUTE ON FUNCTION public.create_credit_sale(jsonb, uuid), public.current_shop(), public.customer_debt(uuid),
  public.has_access(uuid), public.has_role(uuid, public.app_role), public.is_shop_admin(), public.record_payment(uuid, numeric),
  public.create_sale(jsonb), public.add_manual_debt(text, text, text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- 5. Subscription start date
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz;
UPDATE public.organizations SET subscription_started_at = created_at WHERE subscription_active AND subscription_started_at IS NULL;

CREATE OR REPLACE FUNCTION public.mark_checkout_paid(_checkout uuid, _provider_ref text, _event jsonb, _method text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.payment_checkouts%ROWTYPE; o public.organizations%ROWTYPE; base timestamptz; renewing boolean;
BEGIN
  SELECT * INTO c FROM public.payment_checkouts WHERE id = _checkout FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;
  IF c.status = 'paid' THEN RETURN false; END IF;
  SELECT * INTO o FROM public.organizations WHERE id = c.organization_id FOR UPDATE;
  renewing := o.subscription_active AND o.subscription_ends_at > now();
  base := CASE WHEN renewing THEN o.subscription_ends_at ELSE now() END;
  UPDATE public.organizations SET subscription_active = true, plan = c.plan,
    subscription_started_at = CASE WHEN renewing AND subscription_started_at IS NOT NULL THEN subscription_started_at ELSE now() END,
    subscription_ends_at = base + make_interval(months => c.months) WHERE id = c.organization_id;
  UPDATE public.payment_checkouts SET status = 'paid', paid_at = now(),
    provider_ref = COALESCE(_provider_ref, provider_ref), raw_event = _event WHERE id = c.id;
  INSERT INTO public.subscription_payments (shop_id, amount, method, note)
    VALUES (c.organization_id, c.amount, _method, initcap(c.plan) || ' · ' || c.months || ' mois · ' || COALESCE(_provider_ref, c.id::text));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.mark_checkout_paid(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_checkout_paid(uuid, text, jsonb, text) TO service_role;