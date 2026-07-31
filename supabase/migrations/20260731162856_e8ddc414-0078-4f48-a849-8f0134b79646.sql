CREATE OR REPLACE FUNCTION public.consume_app_rate_limit(p_user_id uuid, p_scope text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  limit_count integer;
  window_seconds integer;
  bucket_start timestamptz;
  new_count integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  CASE p_scope
    WHEN 'ai_chat' THEN
      limit_count := 60;
      window_seconds := 600;
    WHEN 'backup_export' THEN
      limit_count := 5;
      window_seconds := 60;
    WHEN 'backup_import' THEN
      limit_count := 2;
      window_seconds := 600;
    WHEN 'push_test' THEN
      limit_count := 5;
      window_seconds := 60;
    WHEN 'mcp_write' THEN
      limit_count := 30;
      window_seconds := 600;
    ELSE
      RAISE EXCEPTION 'Unknown rate-limit scope'
        USING ERRCODE = '22023';
  END CASE;

  bucket_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / window_seconds) * window_seconds
  );

  INSERT INTO public.app_rate_limits (user_id, scope, window_start, request_count)
  VALUES (p_user_id, p_scope, bucket_start, 1)
  ON CONFLICT (user_id, scope, window_start)
  DO UPDATE SET request_count = public.app_rate_limits.request_count + 1
  RETURNING request_count INTO new_count;

  DELETE FROM public.app_rate_limits
  WHERE window_start < now() - interval '2 days';

  RETURN new_count <= limit_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_app_rate_limit(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_app_rate_limit(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.consume_app_rate_limit(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_app_rate_limit(uuid, text) TO service_role;