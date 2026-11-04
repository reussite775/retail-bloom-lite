-- Progression par commande payée (= un acheteur pour une formation). Écrite uniquement par le serveur après vérification du lien secret de la commande.
CREATE TABLE public.digital_lesson_progress (
  order_id uuid NOT NULL REFERENCES public.digital_orders(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.digital_lessons(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, lesson_id)
);
CREATE INDEX digital_lesson_progress_lesson_idx ON public.digital_lesson_progress (lesson_id);

CREATE TABLE public.digital_learning_state (
  order_id uuid PRIMARY KEY REFERENCES public.digital_orders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_lesson_id uuid REFERENCES public.digital_lessons(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.digital_lesson_progress TO authenticated;
GRANT ALL ON public.digital_lesson_progress TO service_role;
GRANT SELECT ON public.digital_learning_state TO authenticated;
GRANT ALL ON public.digital_learning_state TO service_role;
ALTER TABLE public.digital_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_learning_state ENABLE ROW LEVEL SECURITY;
-- Le créateur peut seulement lire la progression de ses propres acheteurs (préparation des statistiques futures).
CREATE POLICY "shop admin reads learner progress" ON public.digital_lesson_progress FOR SELECT TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());
CREATE POLICY "shop admin reads learner state" ON public.digital_learning_state FOR SELECT TO authenticated USING (organization_id = public.current_shop() AND public.is_shop_admin());