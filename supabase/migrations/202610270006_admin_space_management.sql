alter table public.private_spaces
  add column if not exists description text not null default ''
  check (char_length(description) <= 300);

alter table public.private_space_channels
  add column if not exists description text not null default ''
  check (char_length(description) <= 300);

drop function if exists public.admin_list_spaces();
create function public.admin_list_spaces()
returns table (
  id uuid,
  name text,
  description text,
  owner_id uuid,
  actual_member_count bigint,
  display_member_count_override integer
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
  select s.id, s.name, s.description, s.owner_id, count(m.user_id), s.display_member_count_override
  from public.private_spaces s
  left join public.private_space_members m on m.space_id = s.id
  group by s.id
  order by s.created_at desc
  limit 200;
end;
$$;

create or replace function public.admin_list_channels()
returns table (
  id uuid,
  space_id uuid,
  space_name text,
  name text,
  description text
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
  select c.id, c.space_id, s.name, c.name, c.description
  from public.private_space_channels c
  join public.private_spaces s on s.id = c.space_id
  order by s.created_at desc, c.created_at;
end;
$$;

create or replace function public.admin_update_space(
  p_space_id uuid,
  p_name text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_milly_admin() then
    raise exception 'Administrator access required';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 48 then
    raise exception 'Space name must contain 2 to 48 characters';
  end if;
  if char_length(coalesce(p_description, '')) > 300 then
    raise exception 'Space description must not exceed 300 characters';
  end if;

  update public.private_spaces
  set name = trim(p_name), description = trim(coalesce(p_description, ''))
  where id = p_space_id;
  if not found then
    raise exception 'Space not found';
  end if;
end;
$$;

create or replace function public.admin_update_channel(
  p_channel_id uuid,
  p_name text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_milly_admin() then
    raise exception 'Administrator access required';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 32 then
    raise exception 'Channel name must contain 2 to 32 characters';
  end if;
  if char_length(coalesce(p_description, '')) > 300 then
    raise exception 'Channel description must not exceed 300 characters';
  end if;

  update public.private_space_channels
  set name = trim(p_name), description = trim(coalesce(p_description, ''))
  where id = p_channel_id;
  if not found then
    raise exception 'Channel not found';
  end if;
end;
$$;

grant execute on function public.admin_list_spaces() to authenticated;
grant execute on function public.admin_list_channels() to authenticated;
grant execute on function public.admin_update_space(uuid, text, text) to authenticated;
grant execute on function public.admin_update_channel(uuid, text, text) to authenticated;
revoke all on function public.admin_list_spaces() from public, anon;
revoke all on function public.admin_list_channels() from public, anon;
revoke all on function public.admin_update_space(uuid, text, text) from public, anon;
revoke all on function public.admin_update_channel(uuid, text, text) from public, anon;
