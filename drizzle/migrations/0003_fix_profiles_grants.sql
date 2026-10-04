GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (shop_name, slogan, contact, address, logo_url) ON public.profiles TO authenticated;
GRANT INSERT (id, shop_name, slogan, contact, address, logo_url) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products, public.customers TO authenticated;
GRANT SELECT ON public.sales, public.sale_items, public.credit_payments TO authenticated;
GRANT ALL ON public.products, public.customers, public.sales, public.sale_items, public.credit_payments TO service_role;