ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS space_chosen_at timestamptz;
UPDATE public.organizations SET space_chosen_at = COALESCE(created_at, now()) WHERE space_chosen_at IS NULL;
GRANT UPDATE (space_chosen_at) ON public.organizations TO authenticated;