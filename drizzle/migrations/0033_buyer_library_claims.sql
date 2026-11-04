-- Rattachement explicite d'une commande payée à un compte client (pour les commandes sans e-mail ou avec un autre e-mail).
CREATE TABLE public.digital_order_claims (
  order_id uuid PRIMARY KEY REFERENCES public.digital_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX digital_order_claims_user_idx ON public.digital_order_claims (user_id);
GRANT SELECT ON public.digital_order_claims TO authenticated;
GRANT ALL ON public.digital_order_claims TO service_role;
ALTER TABLE public.digital_order_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client reads own claims" ON public.digital_order_claims FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Les comptes clients (acheteurs) n'ont pas de boutique : seul leur profil est créé.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'display_name', ''))
  ON CONFLICT DO NOTHING;
  IF COALESCE(NEW.raw_user_meta_data->>'shop_employee', '') <> 'true'
     AND COALESCE(NEW.raw_user_meta_data->>'account_kind', '') <> 'buyer' THEN
    INSERT INTO public.organizations (id, owner_id) VALUES (NEW.id, NEW.id) ON CONFLICT DO NOTHING;
    INSERT INTO public.organization_members (organization_id, user_id, role, email) VALUES (NEW.id, NEW.id, 'admin', COALESCE(NEW.email, '')) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;