
REVOKE ALL ON FUNCTION public.set_owner_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_owner_id() TO service_role;
