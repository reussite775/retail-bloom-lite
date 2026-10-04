CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  price_amount numeric NOT NULL DEFAULT 0,
  price_period text NOT NULL DEFAULT 'mois',
  contact_email text NOT NULL DEFAULT '',
  contact_whatsapp text NOT NULL DEFAULT '',
  payment_instructions text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings (id) VALUES (true);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read settings" ON public.platform_settings FOR SELECT TO authenticated USING (true);