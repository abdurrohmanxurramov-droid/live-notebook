ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.validate_user_settings_enums()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.gender IS NOT NULL AND NEW.gender NOT IN ('male','female') THEN
    RAISE EXCEPTION 'invalid gender: %', NEW.gender;
  END IF;
  IF NEW.theme NOT IN ('classic','bloom') THEN
    RAISE EXCEPTION 'invalid theme: %', NEW.theme;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_user_settings_enums ON public.user_settings;
CREATE TRIGGER validate_user_settings_enums
  BEFORE INSERT OR UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_settings_enums();