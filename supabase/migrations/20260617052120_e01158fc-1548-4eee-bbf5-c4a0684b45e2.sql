DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid, schedule, jobname, command FROM cron.job ORDER BY jobid LOOP
    RAISE NOTICE 'JOB % | % | % | %', r.jobid, r.jobname, r.schedule, r.command;
  END LOOP;
END $$;