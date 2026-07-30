-- 1. Unschedule reminders
DO $$
DECLARE
  job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR job_id IN
      SELECT jobid
      FROM cron.job
      WHERE jobname IN (
        'lesson-reminders',
        'homework-reminders',
        'payment-reminders'
      )
    LOOP
      PERFORM cron.unschedule(job_id);
    END LOOP;
  END IF;
END;
$$;

-- 2. Relocate pg_net
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net CASCADE;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- 3. Re-create cron jobs only when the server-to-server secret is provisioned.
-- This prevents fresh local/CI databases from calling the production hooks.
DO $reminder_jobs$
BEGIN
  IF public.get_hook_secret() IS NOT NULL THEN
    PERFORM cron.schedule(
      'lesson-reminders',
      '* * * * *',
      $job$
      select net.http_post(
        url := 'https://project--d39d2996-2034-45a2-9d70-95ccd7843397.lovable.app/api/public/hooks/lesson-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdHVuYmZsYXplbmFtd2d5dnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTY0MDMsImV4cCI6MjA5NDU5MjQwM30.1zLCfnuVrnSyhCbHLDVs5E5MA85IZrM6ZqKCQBuxLpI',
          'x-hook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'HOOK_SECRET')
        ),
        body := '{}'::jsonb
      );
      $job$
    );

    PERFORM cron.schedule(
      'homework-reminders',
      '0 6 * * *',
      $job$
      select net.http_post(
        url := 'https://project--d39d2996-2034-45a2-9d70-95ccd7843397.lovable.app/api/public/hooks/homework-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdHVuYmZsYXplbmFtd2d5dnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTY0MDMsImV4cCI6MjA5NDU5MjQwM30.1zLCfnuVrnSyhCbHLDVs5E5MA85IZrM6ZqKCQBuxLpI',
          'x-hook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'HOOK_SECRET')
        ),
        body := '{}'::jsonb
      );
      $job$
    );

    PERFORM cron.schedule(
      'payment-reminders',
      '0 7 * * *',
      $job$
      select net.http_post(
        url := 'https://project--d39d2996-2034-45a2-9d70-95ccd7843397.lovable.app/api/public/hooks/payment-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdHVuYmZsYXplbmFtd2d5dnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTY0MDMsImV4cCI6MjA5NDU5MjQwM30.1zLCfnuVrnSyhCbHLDVs5E5MA85IZrM6ZqKCQBuxLpI',
          'x-hook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'HOOK_SECRET')
        ),
        body := '{}'::jsonb
      );
      $job$
    );
  END IF;
END;
$reminder_jobs$;

-- 4. Cleanup
DROP TABLE IF EXISTS public._cron_snapshot;
