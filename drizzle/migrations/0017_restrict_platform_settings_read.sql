CREATE OR REPLACE FUNCTION public.is_platform_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.organizations WHERE owner_id = _uid)
    OR EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = _uid)
    OR public.has_role(_uid, 'super_admin')
  )
$$;
REVOKE ALL ON FUNCTION public.is_platform_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "signed in read settings" ON public.platform_settings;
CREATE POLICY "shop users read settings" ON public.platform_settings
  FOR SELECT TO authenticated
  USING (public.is_platform_user(auth.uid()));