CREATE TABLE public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  organization_id uuid NOT NULL DEFAULT public.current_shop() REFERENCES public.organizations(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  role text NOT NULL,
  message jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);
CREATE INDEX assistant_messages_user_idx ON public.assistant_messages (user_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_messages TO service_role;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own assistant read" ON public.assistant_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "own assistant insert" ON public.assistant_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "own assistant delete" ON public.assistant_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());