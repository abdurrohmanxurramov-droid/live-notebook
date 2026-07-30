ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS lesson_price numeric,
  ADD COLUMN IF NOT EXISTS lesson_currency text;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_lesson_price_check,
  ADD CONSTRAINT students_lesson_price_check
    CHECK (lesson_price IS NULL OR (lesson_price >= 0 AND lesson_price <= 10000000));

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_lesson_currency_check,
  ADD CONSTRAINT students_lesson_currency_check
    CHECK (lesson_currency IS NULL OR lesson_currency ~ '^([A-Z]{3}|USDT)$');