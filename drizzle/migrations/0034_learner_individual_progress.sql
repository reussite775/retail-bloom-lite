CREATE TABLE public.digital_learner_lessons (
 user_id uuid NOT NULL,
 product_id uuid NOT NULL REFERENCES public.digital_products(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 lesson_id uuid NOT NULL REFERENCES public.digital_lessons(id),
 first_viewed_at timestamptz,
 last_viewed_at timestamptz,
 is_completed boolean NOT NULL DEFAULT false,
 completed_at timestamptz,
 PRIMARY KEY (user_id, product_id, lesson_id)
);
GRANT ALL ON public.digital_learner_lessons TO service_role;
REVOKE ALL ON public.digital_learner_lessons FROM anon, authenticated;
ALTER TABLE public.digital_learner_lessons ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.digital_learner_courses (
 user_id uuid NOT NULL,
 product_id uuid NOT NULL REFERENCES public.digital_products(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 last_lesson_id uuid REFERENCES public.digital_lessons(id),
 first_viewed_at timestamptz,
 last_viewed_at timestamptz,
 PRIMARY KEY (user_id, product_id)
);
GRANT ALL ON public.digital_learner_courses TO service_role;
REVOKE ALL ON public.digital_learner_courses FROM anon, authenticated;
ALTER TABLE public.digital_learner_courses ENABLE ROW LEVEL SECURITY;
CREATE INDEX digital_learner_lessons_product ON public.digital_learner_lessons(product_id, user_id);
CREATE FUNCTION public.record_learner_activity(_user uuid, _product uuid, _organization uuid, _lesson uuid, _action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE at_time timestamptz := clock_timestamp();
BEGIN
 IF _action NOT IN ('view', 'done', 'undone') THEN RAISE EXCEPTION 'Invalid activity'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.digital_products p JOIN public.digital_lessons l ON l.product_id=p.id
  WHERE p.id=_product AND p.organization_id=_organization AND p.product_type='formation'
   AND l.id=_lesson AND l.organization_id=_organization AND l.is_published
 ) THEN RAISE EXCEPTION 'Lesson unavailable'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.digital_orders o JOIN auth.users u ON u.id=_user
  LEFT JOIN public.digital_order_claims c ON c.order_id=o.id
  WHERE o.product_id=_product AND o.organization_id=_organization AND o.status='paid'
   AND (c.user_id=_user OR (c.user_id IS NULL AND u.email_confirmed_at IS NOT NULL
    AND length(trim(coalesce(o.buyer_email,'')))>0 AND lower(trim(o.buyer_email))=lower(trim(u.email))))
 ) THEN RAISE EXCEPTION 'Purchase ownership required'; END IF;
 INSERT INTO public.digital_learner_lessons(user_id,product_id,organization_id,lesson_id,first_viewed_at,last_viewed_at,is_completed,completed_at)
 VALUES (_user,_product,_organization,_lesson,CASE WHEN _action='view' THEN at_time END,CASE WHEN _action='view' THEN at_time END,_action='done',CASE WHEN _action='done' THEN at_time END)
 ON CONFLICT (user_id,product_id,lesson_id) DO UPDATE SET
  first_viewed_at=CASE WHEN _action='view' THEN coalesce(digital_learner_lessons.first_viewed_at,at_time) ELSE digital_learner_lessons.first_viewed_at END,
  last_viewed_at=CASE WHEN _action='view' THEN at_time ELSE digital_learner_lessons.last_viewed_at END,
  is_completed=CASE WHEN _action='view' THEN digital_learner_lessons.is_completed ELSE _action='done' END,
  completed_at=CASE WHEN _action='done' AND NOT digital_learner_lessons.is_completed THEN at_time ELSE digital_learner_lessons.completed_at END;
 IF _action='view' THEN
  INSERT INTO public.digital_learner_courses(user_id,product_id,organization_id,last_lesson_id,first_viewed_at,last_viewed_at)
  VALUES (_user,_product,_organization,_lesson,at_time,at_time)
  ON CONFLICT (user_id,product_id) DO UPDATE SET last_lesson_id=_lesson,last_viewed_at=at_time;
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_learner_activity(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_learner_activity(uuid,uuid,uuid,uuid,text) TO service_role;
COMMENT ON TABLE public.digital_learner_lessons IS 'Individual authenticated learner history; server ownership verification and service-only atomic writes. Legacy order-based progress remains unchanged.';
COMMENT ON TABLE public.digital_learner_courses IS 'Resume position per authenticated learner and formation; no anonymous progress.';