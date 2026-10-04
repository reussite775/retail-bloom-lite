CREATE TYPE public.shop_role AS ENUM ('admin', 'cashier');

CREATE TABLE public.shop_members (
  user_id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.shop_role NOT NULL DEFAULT 'cashier',
  email text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_members TO authenticated;
GRANT ALL ON public.shop_members TO service_role;
ALTER TABLE public.shop_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read self or own shop" ON public.shop_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR shop_id = auth.uid());

CREATE OR REPLACE FUNCTION public.current_shop() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT shop_id FROM public.shop_members WHERE user_id = auth.uid()), auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.is_shop_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.shop_members WHERE user_id = auth.uid() AND role <> 'admin')
$$;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS seller_id uuid;
UPDATE public.sales SET seller_id = user_id WHERE seller_id IS NULL;

ALTER TABLE public.products ALTER COLUMN user_id SET DEFAULT public.current_shop();
ALTER TABLE public.customers ALTER COLUMN user_id SET DEFAULT public.current_shop();

-- profiles: members read the shop profile
DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "shop profile read" ON public.profiles FOR SELECT TO authenticated USING (id = public.current_shop());

-- products: whole shop reads, only admin writes
DROP POLICY IF EXISTS "own products" ON public.products;
CREATE POLICY "shop products read" ON public.products FOR SELECT TO authenticated USING (user_id = public.current_shop());
CREATE POLICY "admin products insert" ON public.products FOR INSERT TO authenticated WITH CHECK (user_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "admin products update" ON public.products FOR UPDATE TO authenticated USING (user_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (user_id = public.current_shop());
CREATE POLICY "admin products delete" ON public.products FOR DELETE TO authenticated USING (user_id = public.current_shop() AND public.is_shop_admin());

-- customers: shop reads/creates, admin edits/deletes
DROP POLICY IF EXISTS "own customers" ON public.customers;
CREATE POLICY "shop customers read" ON public.customers FOR SELECT TO authenticated USING (user_id = public.current_shop());
CREATE POLICY "shop customers insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (user_id = public.current_shop());
CREATE POLICY "admin customers update" ON public.customers FOR UPDATE TO authenticated USING (user_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (user_id = public.current_shop());
CREATE POLICY "admin customers delete" ON public.customers FOR DELETE TO authenticated USING (user_id = public.current_shop() AND public.is_shop_admin());

-- sales: admin sees all; cashier sees credit sales and own sales
DROP POLICY IF EXISTS "own sales" ON public.sales;
CREATE POLICY "shop sales read" ON public.sales FOR SELECT TO authenticated
  USING (user_id = public.current_shop() AND (public.is_shop_admin() OR is_credit OR seller_id = auth.uid()));

DROP POLICY IF EXISTS "own sale items" ON public.sale_items;
CREATE POLICY "shop sale items read" ON public.sale_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id));

DROP POLICY IF EXISTS "own payments read" ON public.credit_payments;
CREATE POLICY "shop payments read" ON public.credit_payments FOR SELECT TO authenticated USING (user_id = public.current_shop());

CREATE OR REPLACE FUNCTION public.create_sale(_items jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _uid uuid := public.current_shop();
  _sale uuid; _it jsonb; _p public.products%ROWTYPE; _qty int;
  _total numeric := 0; _profit numeric := 0; _count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.has_access(_uid) THEN RAISE EXCEPTION 'Essai expiré'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Panier vide'; END IF;
  INSERT INTO public.sales (user_id, seller_id) VALUES (_uid, auth.uid()) RETURNING id INTO _sale;
  FOR _it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_it->>'quantity')::int;
    IF _qty <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
    SELECT * INTO _p FROM public.products WHERE id = (_it->>'product_id')::uuid AND user_id = _uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable'; END IF;
    IF _p.stock < _qty THEN RAISE EXCEPTION 'Stock insuffisant pour %', _p.name; END IF;
    UPDATE public.products SET stock = stock - _qty WHERE id = _p.id;
    INSERT INTO public.sale_items (sale_id, user_id, product_id, product_name, quantity, unit_price, unit_cost)
      VALUES (_sale, _uid, _p.id, _p.name, _qty, _p.sale_price, _p.purchase_price);
    _total := _total + _qty * _p.sale_price;
    _profit := _profit + _qty * (_p.sale_price - _p.purchase_price);
    _count := _count + _qty;
  END LOOP;
  UPDATE public.sales SET total = _total, profit = _profit, items_count = _count WHERE id = _sale;
  RETURN _sale;
END $function$;

CREATE OR REPLACE FUNCTION public.create_credit_sale(_items jsonb, _customer_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE _uid uuid := public.current_shop(); _sale uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id AND user_id = _uid) THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  _sale := public.create_sale(_items);
  UPDATE public.sales SET customer_id = _customer_id, is_credit = true WHERE id = _sale AND user_id = _uid;
  RETURN _sale;
END $function$;

CREATE OR REPLACE FUNCTION public.record_payment(_customer_id uuid, _amount numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE _uid uuid := public.current_shop(); _id uuid; _debt numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.has_access(_uid) THEN RAISE EXCEPTION 'Essai expiré'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id AND user_id = _uid) THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  _debt := public.customer_debt(_customer_id);
  IF _amount > _debt THEN RAISE EXCEPTION 'Le montant dépasse la dette (%)', _debt; END IF;
  INSERT INTO public.credit_payments (user_id, customer_id, amount) VALUES (_uid, _customer_id, _amount) RETURNING id INTO _id;
  RETURN _id;
END $function$;