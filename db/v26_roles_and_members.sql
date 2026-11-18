-- MegaFrame Studio v2.6: secure administrator-managed role assignments.
-- Preserve legacy 'staff' accounts and existing templates.
BEGIN;

ALTER TABLE public.megaframe_members
  DROP CONSTRAINT IF EXISTS megaframe_members_role_check;
ALTER TABLE public.megaframe_members
  ADD CONSTRAINT megaframe_members_role_check
  CHECK (role = ANY (ARRAY['admin','editor','viewer','staff']));

-- Editors may publish/manage shared frames; administrators retain all existing privileges.
CREATE POLICY megaframe_editor_publish
 ON public.megaframe_templates FOR INSERT TO authenticated
 WITH CHECK (
   NOT coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
   AND EXISTS (SELECT 1 FROM public.megaframe_members m
     WHERE m.user_id=(select auth.uid()) AND m.role='editor')
 );
CREATE POLICY megaframe_editor_update
 ON public.megaframe_templates FOR UPDATE TO authenticated
 USING (
   NOT coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
   AND EXISTS (SELECT 1 FROM public.megaframe_members m
     WHERE m.user_id=(select auth.uid()) AND m.role='editor')
 )
 WITH CHECK (
   NOT coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
   AND EXISTS (SELECT 1 FROM public.megaframe_members m
     WHERE m.user_id=(select auth.uid()) AND m.role='editor')
 );
CREATE POLICY megaframe_editor_delete
 ON public.megaframe_templates FOR DELETE TO authenticated
 USING (
   NOT coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
   AND EXISTS (SELECT 1 FROM public.megaframe_members m
     WHERE m.user_id=(select auth.uid()) AND m.role='editor')
 );

-- Owners with editor/viewer role may read their own private frames.
-- Only editors may modify their private templates; viewers are read-only.
CREATE POLICY megaframe_private_new_roles_read
 ON public.megaframe_private_templates FOR SELECT TO authenticated
 USING (
   owner_id=(select auth.uid())
   AND NOT coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
   AND EXISTS (SELECT 1 FROM public.megaframe_members m
     WHERE m.user_id=(select auth.uid()) AND m.role IN ('editor','viewer'))
 );
CREATE POLICY megaframe_private_editor_insert
 ON public.megaframe_private_templates FOR INSERT TO authenticated
 WITH CHECK (
   owner_id=(select auth.uid())
   AND NOT coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
   AND EXISTS (SELECT 1 FROM public.megaframe_members m
     WHERE m.user_id=(select auth.uid()) AND m.role='editor')
 );
CREATE POLICY megaframe_private_editor_update
 ON public.megaframe_private_templates FOR UPDATE TO authenticated
 USING (
   owner_id=(select auth.uid())
   AND NOT coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
   AND EXISTS (SELECT 1 FROM public.megaframe_members m
     WHERE m.user_id=(select auth.uid()) AND m.role='editor')
 )
 WITH CHECK (
   owner_id=(select auth.uid())
   AND NOT coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
   AND EXISTS (SELECT 1 FROM public.megaframe_members m
     WHERE m.user_id=(select auth.uid()) AND m.role='editor')
 );
CREATE POLICY megaframe_private_editor_delete
 ON public.megaframe_private_templates FOR DELETE TO authenticated
 USING (
   owner_id=(select auth.uid())
   AND NOT coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
   AND EXISTS (SELECT 1 FROM public.megaframe_members m
     WHERE m.user_id=(select auth.uid()) AND m.role='editor')
 );

-- SECURE: Supabase Auth emails are visible only to approved administrators.
CREATE OR REPLACE FUNCTION public.megaframe_list_members()
RETURNS TABLE (user_id uuid, email text, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
 IF (SELECT auth.uid()) IS NULL
    OR coalesce(((SELECT auth.jwt())->>'is_anonymous')::boolean,false)
    OR NOT EXISTS (
      SELECT 1 FROM public.megaframe_members me
      WHERE me.user_id=(SELECT auth.uid()) AND me.role='admin'
    )
 THEN
   RAISE EXCEPTION 'Administrator permission required' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT me.user_id, au.email::text, me.role::text
 FROM public.megaframe_members me
 JOIN auth.users au ON au.id=me.user_id
 ORDER BY me.role,au.email;
END
$fn$;

-- Admin may assign an existing Supabase Auth account. Auth account creation
-- must happen through the Supabase administrator dashboard; never in this public client.
CREATE OR REPLACE FUNCTION public.megaframe_manage_member(
 target_email text, desired_role text
)
RETURNS TABLE (user_id uuid, email text, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
 selected_id uuid;
 selected_email text;
BEGIN
 IF (SELECT auth.uid()) IS NULL
    OR coalesce(((SELECT auth.jwt())->>'is_anonymous')::boolean,false)
    OR NOT EXISTS (
      SELECT 1 FROM public.megaframe_members me
      WHERE me.user_id=(SELECT auth.uid()) AND me.role='admin'
    )
 THEN
   RAISE EXCEPTION 'Administrator permission required' USING ERRCODE='42501';
 END IF;
 IF target_email IS NULL OR char_length(btrim(target_email))<3
    OR char_length(target_email)>254
 THEN
   RAISE EXCEPTION 'Enter a valid account email address' USING ERRCODE='22023';
 END IF;
 IF desired_role IS NULL OR desired_role NOT IN ('admin','editor','viewer','remove')
 THEN
   RAISE EXCEPTION 'Invalid membership role' USING ERRCODE='22023';
 END IF;
 SELECT u.id,u.email::text INTO selected_id,selected_email
 FROM auth.users u
 WHERE lower(u.email)=lower(btrim(target_email))
 LIMIT 1;
 IF selected_id IS NULL THEN
   RAISE EXCEPTION 'Account not found. Create the user in Supabase Authentication first.' USING ERRCODE='22023';
 END IF;
 IF selected_id=(SELECT auth.uid()) THEN
   RAISE EXCEPTION 'Cannot change your own administrator access' USING ERRCODE='42501';
 END IF;
 IF desired_role='remove' THEN
   DELETE FROM public.megaframe_members m WHERE m.user_id=selected_id;
   RETURN QUERY SELECT selected_id,selected_email,'removed'::text;
 ELSE
   INSERT INTO public.megaframe_members (user_id,role)
   VALUES (selected_id,desired_role)
   ON CONFLICT (user_id) DO UPDATE SET role=excluded.role;
   RETURN QUERY SELECT selected_id,selected_email,desired_role;
 END IF;
END
$fn$;

-- Do not expose these privileged functions to anonymous browser clients.
REVOKE ALL ON FUNCTION public.megaframe_list_members() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.megaframe_manage_member(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.megaframe_list_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.megaframe_manage_member(text,text) TO authenticated;

COMMIT;
