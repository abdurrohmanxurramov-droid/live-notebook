
DROP VIEW IF EXISTS public.v_lessons_conducted;
CREATE VIEW public.v_lessons_conducted
WITH (security_invoker = true) AS
SELECT
  student_id,
  owner_id,
  COUNT(*) FILTER (WHERE status = 'completed')::int AS lessons_done
FROM public.lessons
GROUP BY student_id, owner_id;

GRANT SELECT ON public.v_lessons_conducted TO authenticated;
GRANT ALL ON public.v_lessons_conducted TO service_role;
