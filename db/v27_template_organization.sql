-- v2.7: cross-device template organization; metadata is stored separately
-- from validated frame settings so existing frame payloads remain compatible.
-- Existing RLS/grants stay unchanged; private templates remain owner scoped.
begin;
alter table public.megaframe_templates
 add column if not exists folder text not null default 'Unfiled',
 add column if not exists category text not null default 'General';
alter table public.megaframe_private_templates
 add column if not exists folder text not null default 'Unfiled',
 add column if not exists category text not null default 'General';
alter table public.megaframe_templates
 add constraint megaframe_templates_folder_limit check (char_length(btrim(folder)) between 1 and 60),
 add constraint megaframe_templates_category_limit check (char_length(btrim(category)) between 1 and 60);
alter table public.megaframe_private_templates
 add constraint megaframe_private_templates_folder_limit check (char_length(btrim(folder)) between 1 and 60),
 add constraint megaframe_private_templates_category_limit check (char_length(btrim(category)) between 1 and 60);
commit;
