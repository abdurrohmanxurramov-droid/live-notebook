CREATE TABLE public.schedule_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  duration_min integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all" ON public.schedule_slots FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_schedule_slots_student ON public.schedule_slots(student_id);
CREATE INDEX idx_schedule_slots_dow ON public.schedule_slots(day_of_week);