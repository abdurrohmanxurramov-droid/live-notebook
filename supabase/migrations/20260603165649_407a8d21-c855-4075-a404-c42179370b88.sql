DO $$ BEGIN
  CREATE TYPE public.lesson_status AS ENUM ('planned','completed','cancelled','moved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL,
  duration_min int NOT NULL DEFAULT 60,
  status public.lesson_status NOT NULL DEFAULT 'planned',
  notes text,
  source_slot_id uuid,
  moved_from_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, scheduled_date, scheduled_time)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "owner select" ON public.lessons FOR SELECT TO authenticated USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "owner insert" ON public.lessons FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "owner update" ON public.lessons FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "owner delete" ON public.lessons FOR DELETE TO authenticated USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS lessons_owner_date_idx ON public.lessons (owner_id, scheduled_date);
CREATE INDEX IF NOT EXISTS lessons_student_date_idx ON public.lessons (student_id, scheduled_date);

DROP TRIGGER IF EXISTS lessons_set_owner ON public.lessons;
CREATE TRIGGER lessons_set_owner BEFORE INSERT ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS lessons_touch_updated ON public.lessons;
CREATE TRIGGER lessons_touch_updated BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- FK with idempotency
DO $$ BEGIN
  ALTER TABLE public.finance ADD CONSTRAINT finance_student_fk FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.homework ADD CONSTRAINT homework_student_fk FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.schedule_slots ADD CONSTRAINT schedule_slots_student_fk FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Keep any existing public.lessons_conducted table intact; the replacement summary is exposed as v_lessons_conducted below.

CREATE OR REPLACE VIEW public.v_lessons_conducted AS
SELECT
  student_id,
  owner_id,
  COUNT(*) FILTER (WHERE status = 'completed')::int AS lessons_done
FROM public.lessons
GROUP BY student_id, owner_id;

GRANT SELECT ON public.v_lessons_conducted TO authenticated;
GRANT ALL ON public.v_lessons_conducted TO service_role;