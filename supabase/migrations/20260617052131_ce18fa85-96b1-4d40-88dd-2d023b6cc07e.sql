CREATE TABLE IF NOT EXISTS public._cron_snapshot (jobid bigint, jobname text, schedule text, command text);
TRUNCATE public._cron_snapshot;
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    INSERT INTO public._cron_snapshot
    SELECT jobid, jobname, schedule, command
    FROM cron.job;
  END IF;
END;
$$;
GRANT SELECT ON public._cron_snapshot TO authenticated, service_role;
