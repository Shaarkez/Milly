alter table public.groups
  add column if not exists public_username text,
  add column if not exists is_verified boolean not null default false;

create unique index if not exists groups_public_username_unique
  on public.groups (lower(public_username))
  where public_username is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.groups'::regclass
      and conname = 'groups_public_username_format'
  ) then
    alter table public.groups
      add constraint groups_public_username_format
      check (public_username is null or public_username ~ '^[a-z0-9_]{3,24}$');
  end if;
end $$;

drop policy if exists "group owners may update group details" on public.groups;
create policy "group owners may update group details"
  on public.groups for update to authenticated
  using (created_by = (select auth.uid()) and public.is_group_member(id))
  with check (created_by = (select auth.uid()) and public.is_group_member(id));

create policy "group owners may delete groups"
  on public.groups for delete to authenticated
  using (created_by = (select auth.uid()) and public.is_group_member(id));

grant update (name, public_username, avatar_path) on public.groups to authenticated;
grant delete on public.groups to authenticated;

create or replace function public.admin_list_groups()
returns table (
  id uuid,
  name text,
  public_username text,
  is_verified boolean,
  created_by uuid,
  created_at timestamptz,
  member_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_milly_admin() then
    raise exception 'Administrator access required';
  end if;

  return query
  select g.id, g.name, g.public_username, g.is_verified, g.created_by, g.created_at,
    count(gm.user_id)
  from public.groups g
  left join public.group_members gm on gm.group_id = g.id
  group by g.id
  order by g.created_at desc;
end;
$$;

create or replace function public.admin_set_group_verified(p_group_id uuid, p_is_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_milly_admin() then
    raise exception 'Administrator access required';
  end if;

  update public.groups
  set is_verified = coalesce(p_is_verified, false)
  where id = p_group_id;

  if not found then
    raise exception 'Group not found';
  end if;
end;
$$;

grant execute on function public.admin_list_groups() to authenticated;
grant execute on function public.admin_set_group_verified(uuid, boolean) to authenticated;
revoke all on function public.admin_list_groups() from public, anon;
revoke all on function public.admin_set_group_verified(uuid, boolean) from public, anon;
