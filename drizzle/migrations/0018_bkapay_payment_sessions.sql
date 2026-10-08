ALTER TABLE public.payment_checkouts
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS transaction_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.payment_checkouts DROP CONSTRAINT IF EXISTS payment_checkouts_status_check;
ALTER TABLE public.payment_checkouts ADD CONSTRAINT payment_checkouts_status_check
  CHECK (status = ANY (ARRAY['pending','paid','failed','cancelled','expired']));
CREATE UNIQUE INDEX IF NOT EXISTS payment_checkouts_transaction_id_key ON public.payment_checkouts(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_checkouts_session_id_key ON public.payment_checkouts(session_id) WHERE session_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.touch_payment_checkouts() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS payment_checkouts_touch ON public.payment_checkouts;
CREATE TRIGGER payment_checkouts_touch BEFORE UPDATE ON public.payment_checkouts FOR EACH ROW EXECUTE FUNCTION public.touch_payment_checkouts();