ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_status_check;
ALTER TABLE public.students ADD CONSTRAINT students_status_check CHECK (status IN ('active','paused','completed','archived'));
CREATE INDEX IF NOT EXISTS students_status_idx ON public.students (owner_id, status) WHERE deleted_at IS NULL;