create or replace function public.remove_group_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_creator uuid;
begin
  select g.created_by into group_creator
  from public.groups g
  where g.id = p_group_id
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = g.id and gm.user_id = (select auth.uid())
    );

  if not found then
    raise exception 'Group not found or membership required';
  end if;
  if p_member_id = group_creator then
    raise exception 'The group creator cannot be removed';
  end if;
  if (select auth.uid()) <> group_creator and p_member_id <> (select auth.uid()) then
    raise exception 'Only the group creator can remove other members';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = p_member_id;

  if not found then
    raise exception 'Group member not found';
  end if;
end;
$$;

grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
