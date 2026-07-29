ALTER TABLE public.finance
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS cycle_number integer NULL;

ALTER TABLE public.finance
  ADD CONSTRAINT finance_entry_type_check
  CHECK (entry_type IN ('manual', 'lesson_cycle'));

ALTER TABLE public.finance
  ADD CONSTRAINT finance_cycle_number_positive_check
  CHECK (cycle_number IS NULL OR cycle_number > 0);

ALTER TABLE public.finance
  ADD CONSTRAINT finance_cycle_number_matches_entry_type_check
  CHECK (
    (entry_type = 'lesson_cycle' AND cycle_number IS NOT NULL)
    OR (entry_type = 'manual' AND cycle_number IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS finance_active_lesson_cycle_uniq
  ON public.finance (owner_id, student_id, cycle_number)
  WHERE entry_type = 'lesson_cycle' AND deleted_at IS NULL;