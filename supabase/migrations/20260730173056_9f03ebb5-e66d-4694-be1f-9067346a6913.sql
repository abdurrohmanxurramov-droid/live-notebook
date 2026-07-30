ALTER TABLE public.finance
  DROP CONSTRAINT IF EXISTS finance_currency_check;
ALTER TABLE public.finance
  ADD CONSTRAINT finance_currency_check
  CHECK (currency ~ '^([A-Z]{3}|USDT)$') NOT VALID;
ALTER TABLE public.finance
  VALIDATE CONSTRAINT finance_currency_check;

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_values_check;
ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_values_check
  CHECK (
    default_currency ~ '^([A-Z]{3}|USDT)$'
    AND default_lesson_duration BETWEEN 5 AND 600
    AND default_lesson_price BETWEEN 0 AND 10000000
    AND week_starts_on BETWEEN 0 AND 6
    AND remind_before_min BETWEEN 0 AND 10000
  ) NOT VALID;
ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_values_check;

ALTER TABLE public.rates
  DROP CONSTRAINT IF EXISTS rates_base_currency_check;
ALTER TABLE public.rates
  ADD CONSTRAINT rates_base_currency_check
  CHECK (base_currency = 'USD') NOT VALID;
ALTER TABLE public.rates
  VALIDATE CONSTRAINT rates_base_currency_check;

ALTER TABLE public.rates
  DROP CONSTRAINT IF EXISTS rates_map_object_check;
ALTER TABLE public.rates
  ADD CONSTRAINT rates_map_object_check
  CHECK (jsonb_typeof(rates_map) = 'object') NOT VALID;
ALTER TABLE public.rates
  VALIDATE CONSTRAINT rates_map_object_check;