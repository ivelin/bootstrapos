-- Down migration for self-serve create_company.
-- Drops the function and the grant. Companies already created stay.
-- Does not remove owner rows or the created_by column.
-- Not applied by Supabase migrate. An operator runs this file to roll back.

DROP TRIGGER IF EXISTS companies_self_serve_audit ON bootstrap_os.companies;
DROP FUNCTION IF EXISTS public.bootstrap_os_audit_self_serve_company();
REVOKE ALL ON FUNCTION public.create_company_self_serve(text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.create_company_self_serve(text);
