create or replace function public.add_group_members(p_group_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_creator uuid;
  current_member_count integer;
begin
  select g.created_by into group_creator
  from public.groups g
  where g.id = p_group_id
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = g.id and gm.user_id = (select auth.uid())
    )
  for update;

  if not found then
    raise exception 'Group not found or membership required';
  end if;
  if group_creator <> (select auth.uid()) then
    raise exception 'Only the group creator can add members';
  end if;
  if coalesce(cardinality(p_member_ids), 0) not between 1 and 49 then
    raise exception 'Select between 1 and 49 contacts';
  end if;
  if exists (
    select 1 from unnest(p_member_ids) as selected(user_id)
    group by selected.user_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate group members are not allowed';
  end if;
  if exists (
    select 1
    from unnest(p_member_ids) as selected(user_id)
    where selected.user_id = (select auth.uid())
      or not public.are_friends((select auth.uid()), selected.user_id)
  ) then
    raise exception 'Group members must be your contacts';
  end if;

  select count(*) into current_member_count
  from public.group_members gm
  where gm.group_id = p_group_id;
  if current_member_count + (
    select count(*) from unnest(p_member_ids) as selected(user_id)
    where not exists (
      select 1 from public.group_members gm
      where gm.group_id = p_group_id and gm.user_id = selected.user_id
    )
  ) > 50 then
    raise exception 'A group can have at most 50 members';
  end if;

  insert into public.group_members (group_id, user_id)
  select p_group_id, selected.user_id
  from unnest(p_member_ids) as selected(user_id)
  on conflict (group_id, user_id) do nothing;
end;
$$;

grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
revoke all on function public.add_group_members(uuid, uuid[]) from public, anon;
