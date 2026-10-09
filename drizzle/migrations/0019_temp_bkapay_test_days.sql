ALTER TABLE public.payment_checkouts ADD COLUMN IF NOT EXISTS duration_days integer;
COMMENT ON COLUMN public.payment_checkouts.duration_days IS 'TEMPORARY: BkaPay 500 FCFA test option (super admin only). Remove after test.';

CREATE OR REPLACE FUNCTION public.mark_checkout_paid(_checkout uuid, _provider_ref text, _event jsonb, _method text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.payment_checkouts%ROWTYPE; o public.organizations%ROWTYPE; base timestamptz; renewing boolean; dur interval; lbl text;
BEGIN
  SELECT * INTO c FROM public.payment_checkouts WHERE id = _checkout FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;
  IF c.status = 'paid' THEN RETURN false; END IF;
  SELECT * INTO o FROM public.organizations WHERE id = c.organization_id FOR UPDATE;
  renewing := o.subscription_active AND o.subscription_ends_at > now();
  base := CASE WHEN renewing THEN o.subscription_ends_at ELSE now() END;
  IF c.duration_days IS NOT NULL THEN dur := make_interval(days => c.duration_days); lbl := c.duration_days || ' jours (test)';
  ELSE dur := make_interval(months => c.months); lbl := c.months || ' mois'; END IF;
  UPDATE public.organizations SET subscription_active = true, plan = c.plan,
    subscription_started_at = CASE WHEN renewing AND subscription_started_at IS NOT NULL THEN subscription_started_at ELSE now() END,
    subscription_ends_at = base + dur WHERE id = c.organization_id;
  UPDATE public.payment_checkouts SET status = 'paid', paid_at = now(),
    provider_ref = COALESCE(_provider_ref, provider_ref), raw_event = _event WHERE id = c.id;
  INSERT INTO public.subscription_payments (shop_id, amount, method, note)
    VALUES (c.organization_id, c.amount, _method, initcap(c.plan) || ' · ' || lbl || ' · ' || COALESCE(_provider_ref, c.id::text));
  RETURN true;
END $function$;