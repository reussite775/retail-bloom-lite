ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS order_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS stock_applied boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.online_orders_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _it jsonb; _qty int; _p public.products%ROWTYPE;
BEGIN
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
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.online_orders_stock() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER online_orders_stock BEFORE INSERT OR UPDATE ON public.online_orders FOR EACH ROW EXECUTE FUNCTION public.online_orders_stock();