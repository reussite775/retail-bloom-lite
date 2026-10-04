ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS referral_code text;
UPDATE public.organizations SET referral_code = upper(substr(md5(id::text || random()::text), 1, 8)) WHERE referral_code IS NULL;
ALTER TABLE public.organizations ALTER COLUMN referral_code SET DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 8));
ALTER TABLE public.organizations ALTER COLUMN referral_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_referral_code_key ON public.organizations(referral_code);

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_org uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referred_org uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  reward_months integer NOT NULL DEFAULT 0,
  CHECK (referrer_org <> referred_org)
);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrer reads own referrals" ON public.referrals FOR SELECT TO authenticated
  USING (referrer_org = public.current_shop() AND public.is_shop_admin());

-- Called by a freshly signed-up owner to attach themselves to a referrer
CREATE OR REPLACE FUNCTION public.claim_referral(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me public.organizations%ROWTYPE; _ref uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO _me FROM public.organizations WHERE id = auth.uid() AND owner_id = auth.uid();
  IF NOT FOUND OR _me.created_at < now() - interval '2 days' THEN RETURN false; END IF;
  SELECT id INTO _ref FROM public.organizations WHERE referral_code = upper(btrim(coalesce(_code, ''))) AND id <> _me.id;
  IF _ref IS NULL THEN RETURN false; END IF;
  INSERT INTO public.referrals (referrer_org, referred_org) VALUES (_ref, _me.id) ON CONFLICT (referred_org) DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral(text) TO authenticated;

-- Referrer view of their referees: shop name + computed status only
CREATE OR REPLACE FUNCTION public.my_referrals()
RETURNS TABLE (id uuid, shop_name text, joined_at timestamptz, status text, rewarded_at timestamptz, reward_months integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, o.name, r.created_at,
    CASE WHEN o.subscription_active AND (o.subscription_ends_at IS NULL OR o.subscription_ends_at > now()) THEN 'active'
         WHEN o.trial_ends_at > now() THEN 'trial' ELSE 'expired' END,
    r.rewarded_at, r.reward_months
  FROM public.referrals r JOIN public.organizations o ON o.id = r.referred_org
  WHERE r.referrer_org = public.current_shop() AND public.is_shop_admin()
  ORDER BY r.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.my_referrals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referrals() TO authenticated;

-- Reward: first paid activation of a referee gives the referrer 1 month
CREATE OR REPLACE FUNCTION public.reward_referrer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.referrals%ROWTYPE; o public.organizations%ROWTYPE;
BEGIN
  IF NEW.subscription_active AND NOT COALESCE(OLD.subscription_active, false) THEN
    SELECT * INTO r FROM public.referrals WHERE referred_org = NEW.id AND rewarded_at IS NULL FOR UPDATE;
    IF FOUND THEN
      SELECT * INTO o FROM public.organizations WHERE id = r.referrer_org FOR UPDATE;
      IF o.subscription_active AND o.subscription_ends_at IS NOT NULL AND o.subscription_ends_at > now() THEN
        UPDATE public.organizations SET subscription_ends_at = subscription_ends_at + interval '1 month' WHERE id = o.id;
      ELSIF NOT (o.subscription_active AND o.subscription_ends_at IS NULL) THEN
        UPDATE public.organizations SET trial_ends_at = greatest(trial_ends_at, now()) + interval '1 month' WHERE id = o.id;
      END IF;
      UPDATE public.referrals SET rewarded_at = now(), reward_months = 1 WHERE id = r.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reward_referrer() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER organizations_reward_referrer AFTER UPDATE OF subscription_active ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.reward_referrer();