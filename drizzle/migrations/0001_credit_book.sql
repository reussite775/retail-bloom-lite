CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own customers" ON public.customers FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.sales ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD COLUMN is_credit boolean NOT NULL DEFAULT false;

CREATE TABLE public.credit_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_payments TO authenticated;
GRANT ALL ON public.credit_payments TO service_role;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments read" ON public.credit_payments FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.customer_debt(_cid uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT sum(total) FROM public.sales WHERE customer_id = _cid AND is_credit), 0)
       - COALESCE((SELECT sum(amount) FROM public.credit_payments WHERE customer_id = _cid), 0)
$$;

CREATE OR REPLACE FUNCTION public.record_payment(_customer_id uuid, _amount numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _debt numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.has_access(_uid) THEN RAISE EXCEPTION 'Essai expiré'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id AND user_id = _uid) THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  _debt := public.customer_debt(_customer_id);
  IF _amount > _debt THEN RAISE EXCEPTION 'Le montant dépasse la dette (%)', _debt; END IF;
  INSERT INTO public.credit_payments (user_id, customer_id, amount) VALUES (_uid, _customer_id, _amount) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.create_credit_sale(_items jsonb, _customer_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sale uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id AND user_id = _uid) THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  _sale := public.create_sale(_items);
  UPDATE public.sales SET customer_id = _customer_id, is_credit = true WHERE id = _sale AND user_id = _uid;
  RETURN _sale;
END $$;