-- v2.6 hardening: keep SECURITY DEFINER membership logic outside the REST-exposed public schema.
-- Public RPC functions remain SECURITY INVOKER with identical API signatures.
BEGIN;
CREATE SCHEMA IF NOT EXISTS megaframe_internal;
REVOKE ALL ON SCHEMA megaframe_internal FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA megaframe_internal TO authenticated;

ALTER FUNCTION public.megaframe_list_members() SET SCHEMA megaframe_internal;
ALTER FUNCTION public.megaframe_manage_member(text,text) SET SCHEMA megaframe_internal;

REVOKE ALL ON FUNCTION megaframe_internal.megaframe_list_members() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION megaframe_internal.megaframe_manage_member(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION megaframe_internal.megaframe_list_members() TO authenticated;
GRANT EXECUTE ON FUNCTION megaframe_internal.megaframe_manage_member(text,text) TO authenticated;

CREATE FUNCTION public.megaframe_list_members()
RETURNS TABLE (user_id uuid, email text, role text)
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$
 SELECT member.user_id, member.email, member.role
 FROM megaframe_internal.megaframe_list_members() AS member;
$$;

CREATE FUNCTION public.megaframe_manage_member(target_email text, desired_role text)
RETURNS TABLE (user_id uuid, email text, role text)
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$
 SELECT member.user_id, member.email, member.role
 FROM megaframe_internal.megaframe_manage_member(target_email, desired_role) AS member;
$$;

REVOKE ALL ON FUNCTION public.megaframe_list_members() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.megaframe_manage_member(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.megaframe_list_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.megaframe_manage_member(text,text) TO authenticated;

COMMIT;
