CREATE OR REPLACE FUNCTION public.add_manual_debt(_name text, _phone text, _items text, _amount numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := public.current_shop(); _cid uuid; _sale uuid;
BEGIN
  IF auth.uid() IS NULL OR _uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.has_access(_uid) THEN RAISE EXCEPTION 'Essai expiré'; END IF;
  _name := btrim(coalesce(_name, '')); _phone := btrim(coalesce(_phone, '')); _items := btrim(coalesce(_items, ''));
  IF length(_name) = 0 OR length(_name) > 100 THEN RAISE EXCEPTION 'Nom du client invalide'; END IF;
  IF length(_phone) > 30 THEN RAISE EXCEPTION 'Téléphone invalide'; END IF;
  IF length(_items) = 0 OR length(_items) > 500 THEN RAISE EXCEPTION 'Indiquez les articles concernés'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 100000000 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  SELECT id INTO _cid FROM public.customers WHERE user_id = _uid
    AND ((_phone <> '' AND phone = _phone) OR (_phone = '' AND lower(name) = lower(_name))) LIMIT 1;
  IF _cid IS NULL THEN
    INSERT INTO public.customers (user_id, name, phone) VALUES (_uid, _name, _phone) RETURNING id INTO _cid;
  END IF;
  INSERT INTO public.sales (user_id, seller_id, customer_id, is_credit, total, profit, items_count)
    VALUES (_uid, auth.uid(), _cid, true, _amount, 0, 1) RETURNING id INTO _sale;
  INSERT INTO public.sale_items (sale_id, user_id, product_id, product_name, quantity, unit_price, unit_cost)
    VALUES (_sale, _uid, NULL, _items, 1, _amount, _amount);
  RETURN _sale;
END $$;
REVOKE ALL ON FUNCTION public.add_manual_debt(text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_manual_debt(text, text, text, numeric) TO authenticated;