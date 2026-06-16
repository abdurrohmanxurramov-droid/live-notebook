
CREATE OR REPLACE FUNCTION public.get_hook_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'HOOK_SECRET' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_hook_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_hook_secret() TO service_role;
