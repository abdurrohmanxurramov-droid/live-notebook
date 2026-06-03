
-- Soft delete: add deleted_at to user-data tables
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.homework ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.schedule_slots ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS students_owner_active_idx ON public.students (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS lessons_owner_date_active_idx ON public.lessons (owner_id, scheduled_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS finance_owner_active_idx ON public.finance (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS homework_owner_active_idx ON public.homework (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS attendance_owner_active_idx ON public.attendance (owner_id, date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS schedule_slots_owner_active_idx ON public.schedule_slots (owner_id) WHERE deleted_at IS NULL;

-- User settings
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY,
  default_currency text NOT NULL DEFAULT 'RUB',
  default_lesson_duration int NOT NULL DEFAULT 60,
  default_lesson_price numeric NOT NULL DEFAULT 0,
  week_starts_on smallint NOT NULL DEFAULT 1,
  remind_before_min int NOT NULL DEFAULT 60,
  locale text NOT NULL DEFAULT 'ru',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings owner select" ON public.user_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_settings owner insert" ON public.user_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_settings owner update" ON public.user_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_settings owner delete" ON public.user_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER user_settings_touch_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
