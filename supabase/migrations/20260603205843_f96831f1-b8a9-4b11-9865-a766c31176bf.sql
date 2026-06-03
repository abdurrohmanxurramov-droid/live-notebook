ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS remind_lessons boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS remind_payments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS remind_homework boolean NOT NULL DEFAULT true;