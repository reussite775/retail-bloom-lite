-- Duplicate legacy status rule rejected 'expired' while payment_checkouts_status_check already allows it.
ALTER TABLE public.payment_checkouts DROP CONSTRAINT IF EXISTS payment_checkouts_status_chk;