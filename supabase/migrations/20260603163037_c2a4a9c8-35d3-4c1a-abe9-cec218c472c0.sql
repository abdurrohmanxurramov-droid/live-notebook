-- 1. Preserve existing data; add ownership metadata safely
-- Existing rows cannot be attributed safely here, so owner_id stays nullable.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.schedule_slots ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.homework ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.lessons_conducted ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.rates ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS owner_id uuid;

-- 2. Foreign keys: cascading delete when student is removed
-- NOT VALID avoids failing this migration on legacy orphaned rows.
DO $$ BEGIN
  ALTER TABLE public.schedule_slots ADD CONSTRAINT schedule_slots_student_fk FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.finance ADD CONSTRAINT finance_student_fk FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.attendance ADD CONSTRAINT attendance_student_fk FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.homework ADD CONSTRAINT homework_student_fk FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.lessons_conducted ADD CONSTRAINT lessons_conducted_student_fk FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_students_owner ON public.students(owner_id);
CREATE INDEX IF NOT EXISTS idx_schedule_owner ON public.schedule_slots(owner_id);
CREATE INDEX IF NOT EXISTS idx_schedule_student ON public.schedule_slots(student_id);
CREATE INDEX IF NOT EXISTS idx_finance_owner ON public.finance(owner_id);
CREATE INDEX IF NOT EXISTS idx_finance_student ON public.finance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_owner ON public.attendance(owner_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_homework_owner ON public.homework(owner_id);
CREATE INDEX IF NOT EXISTS idx_homework_student ON public.homework(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_conducted_owner ON public.lessons_conducted(owner_id);
CREATE INDEX IF NOT EXISTS idx_rates_owner ON public.rates(owner_id);
CREATE INDEX IF NOT EXISTS idx_push_owner ON public.push_subscriptions(owner_id);

-- 4. Trigger to auto-set owner_id on insert
CREATE OR REPLACE FUNCTION public.set_owner_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','schedule_slots','finance','attendance','homework','lessons_conducted','rates','push_subscriptions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_owner_id_trg ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_owner_id_trg BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_owner_id()', t);
  END LOOP;
END $$;

-- 5. Replace public RLS policies with auth.uid() = owner_id
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','schedule_slots','finance','attendance','homework','lessons_conducted','rates','push_subscriptions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "owner select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "owner insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "owner update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "owner delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "owner select" ON public.%I FOR SELECT TO authenticated USING (auth.uid() = owner_id)', t);
    EXECUTE format('CREATE POLICY "owner insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id)', t);
    EXECUTE format('CREATE POLICY "owner update" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id)', t);
    EXECUTE format('CREATE POLICY "owner delete" ON public.%I FOR DELETE TO authenticated USING (auth.uid() = owner_id)', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
