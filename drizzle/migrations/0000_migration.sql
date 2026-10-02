CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  shop_name text NOT NULL DEFAULT 'Ma boutique',
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  subscription_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
-- users may only change shop_name
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (shop_name) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  purchase_price numeric(12,2) NOT NULL DEFAULT 0,
  sale_price numeric(12,2) NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own products" ON public.products FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  total numeric(12,2) NOT NULL DEFAULT 0,
  profit numeric(12,2) NOT NULL DEFAULT 0,
  items_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sales" ON public.sales FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  unit_cost numeric(12,2) NOT NULL
);
GRANT SELECT ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sale items" ON public.sale_items FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_access(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND (subscription_active OR trial_ends_at > now()))
$$;

CREATE OR REPLACE FUNCTION public.create_sale(_items jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _sale uuid;
  _it jsonb;
  _p public.products%ROWTYPE;
  _qty int;
  _total numeric := 0; _profit numeric := 0; _count int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.has_access(_uid) THEN RAISE EXCEPTION 'Essai expiré'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Panier vide'; END IF;
  INSERT INTO public.sales (user_id) VALUES (_uid) RETURNING id INTO _sale;
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
END $$;
REVOKE EXECUTE ON FUNCTION public.create_sale(jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_sale(jsonb) TO authenticated;