-- MegaFrame Studio v2.2: private, owner-scoped frame templates.
-- Does not modify existing published templates or membership roles.
begin;
create table if not exists public.megaframe_private_templates (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 140),
 settings jsonb not null check (
   jsonb_typeof(settings)='object'
   and octet_length(settings::text)<=32768
   and settings ?& array['rect','shape','frameOpening','appearance','collage']
   and (settings - array['rect','shape','frameOpening','appearance','collage'])='{}'::jsonb
 ),
 artwork text not null check (
   octet_length(artwork)<=12582912
   and artwork ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'
 ),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now()
);
create index if not exists megaframe_private_templates_owner_updated_idx
 on public.megaframe_private_templates(owner_id,updated_at desc);
alter table public.megaframe_private_templates enable row level security;
revoke all on table public.megaframe_private_templates from anon, public;
grant select, insert, update, delete on public.megaframe_private_templates to authenticated;
-- Restrict access to approved users and their own records; never read private rows anonymously.
create policy "private_owner_read" on public.megaframe_private_templates for select to authenticated
 using (
  owner_id=(select auth.uid()) and
  not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and
  exists(select 1 from public.megaframe_members m
    where m.user_id=(select auth.uid()) and m.role in ('admin','staff'))
 );
create policy "private_owner_insert" on public.megaframe_private_templates for insert to authenticated
 with check (
  owner_id=(select auth.uid()) and
  not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and
  exists(select 1 from public.megaframe_members m
    where m.user_id=(select auth.uid()) and m.role in ('admin','staff'))
 );
create policy "private_owner_update" on public.megaframe_private_templates for update to authenticated
 using (
  owner_id=(select auth.uid()) and
  not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and
  exists(select 1 from public.megaframe_members m
    where m.user_id=(select auth.uid()) and m.role in ('admin','staff'))
 )
 with check (
  owner_id=(select auth.uid()) and
  not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and
  exists(select 1 from public.megaframe_members m
    where m.user_id=(select auth.uid()) and m.role in ('admin','staff'))
 );
create policy "private_owner_delete" on public.megaframe_private_templates for delete to authenticated
 using (
  owner_id=(select auth.uid()) and
  not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and
  exists(select 1 from public.megaframe_members m
    where m.user_id=(select auth.uid()) and m.role in ('admin','staff'))
 );
create trigger megaframe_private_revision_before_update
 before update on public.megaframe_private_templates
 for each row execute function public.megaframe_update_revision();
commit;
