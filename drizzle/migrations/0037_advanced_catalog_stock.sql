-- Products: new optional columns (existing rows keep working)
ALTER TABLE public.products
  ADD COLUMN sku text NOT NULL DEFAULT '',
  ADD COLUMN barcode text NOT NULL DEFAULT '',
  ADD COLUMN category_id uuid,
  ADD COLUMN unit text NOT NULL DEFAULT 'pièce',
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN image_url text NOT NULL DEFAULT '',
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN allow_negative_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN has_variants boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX products_sku_unique ON public.products (user_id, lower(sku)) WHERE sku <> '';
CREATE UNIQUE INDEX products_barcode_unique ON public.products (user_id, barcode) WHERE barcode <> '';

CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_shop() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop categories read" ON public.product_categories FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "admin categories insert" ON public.product_categories FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "admin categories update" ON public.product_categories FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop());
CREATE POLICY "admin categories delete" ON public.product_categories FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

ALTER TABLE public.products ADD CONSTRAINT products_category_fk FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL;

CREATE TABLE public.product_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_shop() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_units TO authenticated;
GRANT ALL ON public.product_units TO service_role;
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop units read" ON public.product_units FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "admin units insert" ON public.product_units FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "admin units delete" ON public.product_units FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_shop() REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  sku text NOT NULL DEFAULT '',
  barcode text NOT NULL DEFAULT '',
  sale_price numeric CHECK (sale_price IS NULL OR sale_price >= 0),
  purchase_price numeric CHECK (purchase_price IS NULL OR purchase_price >= 0),
  stock integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_variants_product_idx ON public.product_variants (product_id);
CREATE UNIQUE INDEX product_variants_sku_unique ON public.product_variants (organization_id, lower(sku)) WHERE sku <> '';
CREATE UNIQUE INDEX product_variants_barcode_unique ON public.product_variants (organization_id, barcode) WHERE barcode <> '';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop variants read" ON public.product_variants FOR SELECT TO authenticated USING (organization_id = public.current_shop());
CREATE POLICY "admin variants insert" ON public.product_variants FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "admin variants update" ON public.product_variants FOR UPDATE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin()) WITH CHECK (organization_id = public.current_shop());
CREATE POLICY "admin variants delete" ON public.product_variants FOR DELETE TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

-- Stock movements: written only by triggers/RPCs, read by the shop
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  item_name text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('initial','in','out','adjustment','loss','damage','sale','return','inventory','order')),
  quantity integer NOT NULL,
  stock_after integer NOT NULL,
  reason text NOT NULL DEFAULT '',
  ref_id uuid,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_org_idx ON public.stock_movements (organization_id, created_at DESC);
CREATE INDEX stock_movements_product_idx ON public.stock_movements (product_id, created_at DESC);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop movements read" ON public.stock_movements FOR SELECT TO authenticated USING (organization_id = public.current_shop());

ALTER TABLE public.sale_items ADD COLUMN variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN returned_quantity integer NOT NULL DEFAULT 0;

CREATE TABLE public.sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  amount numeric NOT NULL DEFAULT 0,
  restocked boolean NOT NULL,
  reason text NOT NULL DEFAULT '',
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sale_returns TO authenticated;
GRANT ALL ON public.sale_returns TO service_role;
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop returns read" ON public.sale_returns FOR SELECT TO authenticated USING (organization_id = public.current_shop());

CREATE TABLE public.inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','cancelled')),
  note text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_by uuid,
  validated_at timestamptz
);
GRANT SELECT ON public.inventories TO authenticated;
GRANT ALL ON public.inventories TO service_role;
ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop inventories read" ON public.inventories FOR SELECT TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());

CREATE TABLE public.inventory_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  expected integer NOT NULL,
  counted integer CHECK (counted IS NULL OR counted >= 0)
);
CREATE INDEX inventory_lines_inv_idx ON public.inventory_lines (inventory_id);
GRANT SELECT, UPDATE (counted) ON public.inventory_lines TO authenticated;
GRANT ALL ON public.inventory_lines TO service_role;
ALTER TABLE public.inventory_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin inventory lines read" ON public.inventory_lines FOR SELECT TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "admin inventory lines count" ON public.inventory_lines FOR UPDATE TO authenticated
  USING (organization_id = public.current_shop() AND public.is_shop_admin()
    AND EXISTS (SELECT 1 FROM public.inventories i WHERE i.id = inventory_id AND i.status = 'draft'))
  WITH CHECK (organization_id = public.current_shop());

-- Same-shop guard for variants/categories references
CREATE OR REPLACE FUNCTION public.catalog_same_shop_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'product_variants' THEN
    IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.user_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'Produit introuvable'; END IF;
  ELSIF TG_TABLE_NAME = 'products' THEN
    IF NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_categories c WHERE c.id = NEW.category_id AND c.organization_id = NEW.user_id) THEN
      RAISE EXCEPTION 'Catégorie introuvable'; END IF;
  ELSIF TG_TABLE_NAME = 'product_categories' THEN
    IF NEW.parent_id IS NOT NULL AND (NEW.parent_id = NEW.id OR NOT EXISTS (SELECT 1 FROM public.product_categories c WHERE c.id = NEW.parent_id AND c.organization_id = NEW.organization_id AND c.parent_id IS NULL)) THEN
      RAISE EXCEPTION 'Catégorie parente invalide'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_variants_same_shop BEFORE INSERT OR UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.catalog_same_shop_guard();
CREATE TRIGGER products_same_shop BEFORE INSERT OR UPDATE OF category_id ON public.products FOR EACH ROW EXECUTE FUNCTION public.catalog_same_shop_guard();
CREATE TRIGGER product_categories_same_shop BEFORE INSERT OR UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.catalog_same_shop_guard();

-- Automatic stock journal. Callers set gestipro.move_kind / move_reason / move_ref for context.
CREATE OR REPLACE FUNCTION public.log_stock_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _pid uuid; _vid uuid; _name text; _delta int; _kind text; _old int;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    IF current_setting('gestipro.sync', true) = '1' THEN RETURN NEW; END IF;
    _org := NEW.user_id; _pid := NEW.id; _vid := NULL; _name := NEW.name;
  ELSE
    _org := NEW.organization_id; _pid := NEW.product_id; _vid := NEW.id;
    SELECT p.name || ' — ' || NEW.name INTO _name FROM public.products p WHERE p.id = NEW.product_id;
  END IF;
  _old := CASE WHEN TG_OP = 'INSERT' THEN 0 ELSE OLD.stock END;
  _delta := NEW.stock - _old;
  IF _delta = 0 THEN RETURN NEW; END IF;
  _kind := CASE WHEN TG_OP = 'INSERT' THEN 'initial' ELSE coalesce(nullif(current_setting('gestipro.move_kind', true), ''), 'adjustment') END;
  INSERT INTO public.stock_movements (organization_id, product_id, variant_id, item_name, kind, quantity, stock_after, reason, ref_id, user_id)
  VALUES (_org, _pid, _vid, coalesce(_name, ''), _kind, _delta, NEW.stock,
    CASE WHEN TG_OP = 'INSERT' THEN 'Stock initial' ELSE coalesce(current_setting('gestipro.move_reason', true), '') END,
    nullif(current_setting('gestipro.move_ref', true), '')::uuid, auth.uid());
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.log_stock_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER products_stock_log AFTER INSERT OR UPDATE OF stock ON public.products FOR EACH ROW EXECUTE FUNCTION public.log_stock_change();
CREATE TRIGGER variants_stock_log AFTER INSERT OR UPDATE OF stock ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.log_stock_change();

-- Product with variants: its stock is the sum of active variants and cannot be edited directly.
CREATE OR REPLACE FUNCTION public.products_variant_stock_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock AND current_setting('gestipro.sync', true) IS DISTINCT FROM '1'
     AND EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = NEW.id) THEN
    RAISE EXCEPTION 'Le stock de ce produit se gère par variante';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER products_variant_stock_guard BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_variant_stock_guard();

CREATE OR REPLACE FUNCTION public.sync_variant_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pid uuid := coalesce(NEW.product_id, OLD.product_id);
BEGIN
  PERFORM set_config('gestipro.sync', '1', true);
  UPDATE public.products p SET
    stock = coalesce((SELECT sum(v.stock) FROM public.product_variants v WHERE v.product_id = _pid AND NOT v.is_archived), 0),
    has_variants = EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = _pid)
  WHERE p.id = _pid;
  PERFORM set_config('gestipro.sync', '', true);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sync_variant_parent() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER variants_sync_parent AFTER INSERT OR UPDATE OR DELETE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.sync_variant_parent();

-- Manual stock operation (admin)
CREATE OR REPLACE FUNCTION public.record_stock_movement(_product uuid, _variant uuid, _kind text, _quantity int, _reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := public.current_shop(); _new int; _delta int;
BEGIN
  IF auth.uid() IS NULL OR _uid IS NULL OR NOT public.is_shop_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF NOT public.has_access(_uid) THEN RAISE EXCEPTION 'Essai expiré'; END IF;
  IF _kind NOT IN ('in','out','adjustment','loss','damage') THEN RAISE EXCEPTION 'Type de mouvement invalide'; END IF;
  IF _quantity IS NULL OR (_kind <> 'adjustment' AND _quantity <= 0) OR (_kind = 'adjustment' AND _quantity < 0) THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
  IF _kind IN ('loss','damage','out','adjustment') AND length(trim(coalesce(_reason,''))) = 0 AND _kind <> 'out' THEN RAISE EXCEPTION 'Indiquez un motif'; END IF;
  PERFORM set_config('gestipro.move_kind', _kind, true);
  PERFORM set_config('gestipro.move_reason', coalesce(_reason, ''), true);
  IF _variant IS NOT NULL THEN
    SELECT CASE WHEN _kind = 'adjustment' THEN _quantity - stock WHEN _kind = 'in' THEN _quantity ELSE -_quantity END INTO _delta
      FROM public.product_variants WHERE id = _variant AND product_id = _product AND organization_id = _uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variante introuvable'; END IF;
    UPDATE public.product_variants SET stock = stock + _delta WHERE id = _variant RETURNING stock INTO _new;
  ELSE
    IF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = _product) THEN RAISE EXCEPTION 'Choisissez une variante'; END IF;
    SELECT CASE WHEN _kind = 'adjustment' THEN _quantity - stock WHEN _kind = 'in' THEN _quantity ELSE -_quantity END INTO _delta
      FROM public.products WHERE id = _product AND user_id = _uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable'; END IF;
    UPDATE public.products SET stock = stock + _delta WHERE id = _product RETURNING stock INTO _new;
  END IF;
  IF _new < 0 THEN RAISE EXCEPTION 'Stock insuffisant'; END IF;
  PERFORM set_config('gestipro.move_kind', '', true);
  PERFORM set_config('gestipro.move_reason', '', true);
  RETURN _new;
END $$;
REVOKE ALL ON FUNCTION public.record_stock_movement(uuid, uuid, text, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid, uuid, text, int, text) TO authenticated;

-- Sales: variants, optional out-of-stock selling, journaled
CREATE OR REPLACE FUNCTION public.create_sale(_items jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := public.current_shop();
  _sale uuid; _it jsonb; _p public.products%ROWTYPE; _v public.product_variants%ROWTYPE; _qty int;
  _price numeric; _cost numeric; _avail int; _name text; _vid uuid;
  _total numeric := 0; _profit numeric := 0; _count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.has_access(_uid) THEN RAISE EXCEPTION 'Essai expiré'; END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Panier vide'; END IF;
  INSERT INTO public.sales (user_id, seller_id) VALUES (_uid, auth.uid()) RETURNING id INTO _sale;
  PERFORM set_config('gestipro.move_kind', 'sale', true);
  PERFORM set_config('gestipro.move_reason', 'Vente', true);
  PERFORM set_config('gestipro.move_ref', _sale::text, true);
  FOR _it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_it->>'quantity')::int;
    IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
    SELECT * INTO _p FROM public.products WHERE id = (_it->>'product_id')::uuid AND user_id = _uid FOR UPDATE;
    IF NOT FOUND OR _p.is_archived THEN RAISE EXCEPTION 'Produit introuvable'; END IF;
    _vid := nullif(_it->>'variant_id', '')::uuid;
    IF _vid IS NOT NULL THEN
      SELECT * INTO _v FROM public.product_variants WHERE id = _vid AND product_id = _p.id AND organization_id = _uid FOR UPDATE;
      IF NOT FOUND OR _v.is_archived THEN RAISE EXCEPTION 'Variante introuvable'; END IF;
      _price := coalesce(_v.sale_price, _p.sale_price); _cost := coalesce(_v.purchase_price, _p.purchase_price);
      _avail := _v.stock; _name := _p.name || ' — ' || _v.name;
    ELSE
      IF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = _p.id AND NOT is_archived) THEN RAISE EXCEPTION 'Choisissez une variante pour %', _p.name; END IF;
      _price := _p.sale_price; _cost := _p.purchase_price; _avail := _p.stock; _name := _p.name;
    END IF;
    IF _avail < _qty AND NOT _p.allow_negative_stock THEN RAISE EXCEPTION 'Stock insuffisant pour %', _name; END IF;
    IF _vid IS NOT NULL THEN UPDATE public.product_variants SET stock = stock - _qty WHERE id = _vid;
    ELSE UPDATE public.products SET stock = stock - _qty WHERE id = _p.id; END IF;
    INSERT INTO public.sale_items (sale_id, user_id, product_id, variant_id, product_name, quantity, unit_price, unit_cost)
      VALUES (_sale, _uid, _p.id, _vid, _name, _qty, _price, _cost);
    _total := _total + _qty * _price;
    _profit := _profit + _qty * (_price - _cost);
    _count := _count + _qty;
  END LOOP;
  PERFORM set_config('gestipro.move_kind', '', true);
  PERFORM set_config('gestipro.move_reason', '', true);
  PERFORM set_config('gestipro.move_ref', '', true);
  UPDATE public.sales SET total = _total, profit = _profit, items_count = _count WHERE id = _sale;
  RETURN _sale;
END $$;

-- Returns (admin): restock or record as damaged, never more than sold
CREATE OR REPLACE FUNCTION public.return_sale_item(_sale_item uuid, _quantity int, _restock boolean, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := public.current_shop(); _si public.sale_items%ROWTYPE; _ret uuid;
BEGIN
  IF auth.uid() IS NULL OR _uid IS NULL OR NOT public.is_shop_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
  SELECT * INTO _si FROM public.sale_items WHERE id = _sale_item AND user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Article introuvable'; END IF;
  IF _si.returned_quantity + _quantity > _si.quantity THEN RAISE EXCEPTION 'Quantité retournée supérieure à la quantité vendue'; END IF;
  UPDATE public.sale_items SET returned_quantity = returned_quantity + _quantity WHERE id = _si.id;
  INSERT INTO public.sale_returns (organization_id, sale_id, sale_item_id, quantity, amount, restocked, reason, user_id)
    VALUES (_uid, _si.sale_id, _si.id, _quantity, _quantity * _si.unit_price, _restock, coalesce(_reason, ''), auth.uid()) RETURNING id INTO _ret;
  PERFORM set_config('gestipro.move_ref', _ret::text, true);
  IF _restock THEN
    PERFORM set_config('gestipro.move_kind', 'return', true);
    PERFORM set_config('gestipro.move_reason', coalesce(nullif(_reason, ''), 'Retour client'), true);
    IF _si.variant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.product_variants WHERE id = _si.variant_id) THEN
      UPDATE public.product_variants SET stock = stock + _quantity WHERE id = _si.variant_id AND organization_id = _uid;
    ELSIF _si.product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = _si.product_id) THEN
      UPDATE public.products SET stock = stock + _quantity WHERE id = _si.product_id AND user_id = _uid;
    END IF;
  ELSE
    INSERT INTO public.stock_movements (organization_id, product_id, variant_id, item_name, kind, quantity, stock_after, reason, ref_id, user_id)
    SELECT _uid, _si.product_id, _si.variant_id, _si.product_name, 'damage', 0,
      coalesce((SELECT stock FROM public.product_variants WHERE id = _si.variant_id), (SELECT stock FROM public.products WHERE id = _si.product_id), 0),
      'Retour non remis en stock (' || _quantity || ') : ' || coalesce(_reason, ''), _ret, auth.uid();
  END IF;
  PERFORM set_config('gestipro.move_kind', '', true);
  PERFORM set_config('gestipro.move_reason', '', true);
  PERFORM set_config('gestipro.move_ref', '', true);
  RETURN _ret;
END $$;
REVOKE ALL ON FUNCTION public.return_sale_item(uuid, int, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_sale_item(uuid, int, boolean, text) TO authenticated;

-- Inventories
CREATE OR REPLACE FUNCTION public.start_inventory(_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := public.current_shop(); _inv uuid;
BEGIN
  IF auth.uid() IS NULL OR _uid IS NULL OR NOT public.is_shop_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventories WHERE organization_id = _uid AND status = 'draft') THEN RAISE EXCEPTION 'Un inventaire est déjà en cours'; END IF;
  INSERT INTO public.inventories (organization_id, note, created_by) VALUES (_uid, coalesce(_note, ''), auth.uid()) RETURNING id INTO _inv;
  INSERT INTO public.inventory_lines (inventory_id, organization_id, product_id, variant_id, item_name, expected)
    SELECT _inv, _uid, p.id, NULL, p.name, p.stock FROM public.products p
      WHERE p.user_id = _uid AND NOT p.is_archived AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id)
    UNION ALL
    SELECT _inv, _uid, p.id, v.id, p.name || ' — ' || v.name, v.stock FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
      WHERE v.organization_id = _uid AND NOT v.is_archived AND NOT p.is_archived;
  RETURN _inv;
END $$;

CREATE OR REPLACE FUNCTION public.close_inventory(_inventory uuid, _validate boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := public.current_shop(); _l public.inventory_lines%ROWTYPE; _n int := 0; _cur int;
BEGIN
  IF auth.uid() IS NULL OR _uid IS NULL OR NOT public.is_shop_admin() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM public.inventories WHERE id = _inventory AND organization_id = _uid AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventaire introuvable ou déjà clôturé'; END IF;
  IF NOT _validate THEN
    UPDATE public.inventories SET status = 'cancelled', validated_by = auth.uid(), validated_at = now() WHERE id = _inventory;
    RETURN 0;
  END IF;
  PERFORM set_config('gestipro.move_kind', 'inventory', true);
  PERFORM set_config('gestipro.move_reason', 'Inventaire physique', true);
  PERFORM set_config('gestipro.move_ref', _inventory::text, true);
  FOR _l IN SELECT * FROM public.inventory_lines WHERE inventory_id = _inventory AND counted IS NOT NULL LOOP
    -- apply the counted gap to current stock (sales made during counting are kept)
    IF _l.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock = stock + (_l.counted - _l.expected) WHERE id = _l.variant_id AND organization_id = _uid AND _l.counted <> _l.expected;
    ELSIF _l.product_id IS NOT NULL THEN
      UPDATE public.products SET stock = stock + (_l.counted - _l.expected) WHERE id = _l.product_id AND user_id = _uid AND _l.counted <> _l.expected;
    END IF;
    IF _l.counted <> _l.expected THEN _n := _n + 1; END IF;
  END LOOP;
  PERFORM set_config('gestipro.move_kind', '', true);
  PERFORM set_config('gestipro.move_reason', '', true);
  PERFORM set_config('gestipro.move_ref', '', true);
  UPDATE public.inventories SET status = 'validated', validated_by = auth.uid(), validated_at = now() WHERE id = _inventory;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.start_inventory(text), public.close_inventory(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_inventory(text), public.close_inventory(uuid, boolean) TO authenticated;

-- Online deliveries also journaled
CREATE OR REPLACE FUNCTION public.online_orders_stock()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _it jsonb; _qty int; _p public.products%ROWTYPE;
BEGIN
  PERFORM set_config('gestipro.move_kind', 'order', true);
  PERFORM set_config('gestipro.move_reason', 'Commande en ligne', true);
  PERFORM set_config('gestipro.move_ref', NEW.id::text, true);
  IF TG_OP = 'UPDATE' AND OLD.stock_applied AND NEW.order_items IS DISTINCT FROM OLD.order_items THEN
    RAISE EXCEPTION 'Articles non modifiables après livraison';
  END IF;
  IF NEW.status = 'delivered' AND NOT NEW.stock_applied THEN
    FOR _it IN SELECT * FROM jsonb_array_elements(NEW.order_items) LOOP
      _qty := (_it->>'quantity')::int;
      IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
      SELECT * INTO _p FROM public.products WHERE id = (_it->>'product_id')::uuid AND user_id = NEW.organization_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable'; END IF;
      IF _p.stock < _qty THEN RAISE EXCEPTION 'Stock insuffisant pour %', _p.name; END IF;
      UPDATE public.products SET stock = stock - _qty WHERE id = _p.id;
    END LOOP;
    NEW.stock_applied := true;
  ELSIF NEW.status <> 'delivered' AND TG_OP = 'UPDATE' AND OLD.stock_applied THEN
    FOR _it IN SELECT * FROM jsonb_array_elements(OLD.order_items) LOOP
      UPDATE public.products SET stock = stock + (_it->>'quantity')::int
        WHERE id = (_it->>'product_id')::uuid AND user_id = NEW.organization_id;
    END LOOP;
    NEW.stock_applied := false;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.stock_applied := OLD.stock_applied;
  ELSE
    NEW.stock_applied := false;
  END IF;
  PERFORM set_config('gestipro.move_kind', '', true);
  PERFORM set_config('gestipro.move_reason', '', true);
  PERFORM set_config('gestipro.move_ref', '', true);
  RETURN NEW;
END $function$;