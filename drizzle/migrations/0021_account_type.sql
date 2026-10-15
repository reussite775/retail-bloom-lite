ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'physical';
ALTER TABLE public.organizations ADD CONSTRAINT organizations_account_type_check CHECK (account_type IN ('physical','digital'));
GRANT UPDATE (account_type) ON public.organizations TO authenticated;