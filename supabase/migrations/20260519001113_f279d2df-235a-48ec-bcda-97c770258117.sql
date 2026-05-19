CREATE TABLE public.homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  task text NOT NULL,
  status text NOT NULL DEFAULT 'assigned',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all" ON public.homework FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_homework_student ON public.homework(student_id);
CREATE INDEX idx_homework_status ON public.homework(status);