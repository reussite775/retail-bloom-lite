CREATE TABLE public.digital_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.digital_products(id) ON DELETE SET NULL,
  product_title text NOT NULL,
  product_type text NOT NULL DEFAULT 'file',
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'XOF',
  buyer_name text NOT NULL,
  buyer_phone text NOT NULL,
  buyer_email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','expired')),
  access_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  session_id text,
  transaction_id text UNIQUE,
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX digital_orders_org_idx ON public.digital_orders (organization_id, created_at DESC);
CREATE INDEX digital_orders_pending_idx ON public.digital_orders (status, created_at) WHERE status = 'pending';

GRANT SELECT ON public.digital_orders TO authenticated;
GRANT ALL ON public.digital_orders TO service_role;
ALTER TABLE public.digital_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shop admins read their digital orders" ON public.digital_orders
  FOR SELECT TO authenticated
  USING (organization_id = public.current_shop() AND public.is_shop_admin());

CREATE TRIGGER digital_orders_touch BEFORE UPDATE ON public.digital_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_payment_checkouts();