create table if not exists public.milly_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.milly_admins (user_id)
values ('6a3ecd6f-7f0a-424a-a02d-ef133f23003a')
on conflict (user_id) do nothing;

alter table public.milly_admins enable row level security;
create policy "admins may view own admin status"
  on public.milly_admins for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.milly_admins from anon, authenticated;
grant select on public.milly_admins to authenticated;

alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists registration_date_override timestamptz;

alter table public.private_spaces
  add column if not exists display_member_count_override integer
  check (display_member_count_override is null or display_member_count_override between 0 and 1000000000);

create table if not exists public.profile_aliases (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,24}$'),
  created_at timestamptz not null default now(),
  unique (username)
);

create index if not exists profile_aliases_user_idx on public.profile_aliases (user_id);
alter table public.profile_aliases enable row level security;
create policy "visible profile aliases may be read"
  on public.profile_aliases for select to authenticated
  using (public.can_view_profile(user_id));
revoke all on public.profile_aliases from anon, authenticated;
grant select on public.profile_aliases to authenticated;

create or replace function public.prevent_username_alias_conflicts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'profiles' then
    if exists (
      select 1 from public.profile_aliases a
      where a.username = new.username and a.user_id <> new.id
    ) then
      raise exception 'Username is reserved as another profile alias';
    end if;
  elsif exists (
    select 1 from public.profiles p
    where p.username = new.username and p.id <> new.user_id
  ) then
    raise exception 'Alias is already used as a primary username';
  end if;
  return new;
end;
$$;

create trigger profiles_username_alias_guard
  before insert or update of username on public.profiles
  for each row execute function public.prevent_username_alias_conflicts();
create trigger profile_aliases_username_guard
  before insert or update of username, user_id on public.profile_aliases
  for each row execute function public.prevent_username_alias_conflicts();

drop function if exists public.search_users(text);
create function public.search_users(lookup_query text)
returns table (
  id uuid,
  user_number bigint,
  username text,
  display_name text,
  avatar_path text,
  is_verified boolean,
  aliases text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with query_value as (
    select lower(regexp_replace(trim(coalesce(lookup_query, '')), '^[@#]', '')) as value
  )
  select p.id, p.user_number, p.username, p.display_name, p.avatar_path, p.is_verified,
    coalesce((
      select array_agg(a.username order by a.username)
      from public.profile_aliases a
      where a.user_id = p.id
    ), '{}'::text[])
  from public.profiles p
  cross join query_value q
  where (select auth.uid()) is not null
    and char_length(q.value) between 1 and 32
    and p.id <> (select auth.uid())
    and (
      left(p.username, char_length(q.value)) = q.value
      or exists (
        select 1 from public.profile_aliases a
        where a.user_id = p.id and left(a.username, char_length(q.value)) = q.value
      )
      or (q.value ~ '^[0-9]+$' and left(p.user_number::text, char_length(q.value)) = q.value)
      or upper(p.milly_id) = upper(trim(lookup_query))
    )
  order by
    (p.username = q.value) desc,
    exists (select 1 from public.profile_aliases a where a.user_id = p.id and a.username = q.value) desc,
    (p.user_number::text = q.value) desc,
    p.user_number
  limit 8;
$$;

create or replace function public.is_milly_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.milly_admins a
    where a.user_id = (select auth.uid())
  );
$$;

create or replace function public.admin_search_profiles(p_query text default '')
returns table (
  id uuid,
  display_name text,
  username text,
  user_number bigint,
  avatar_path text,
  is_verified boolean,
  created_at timestamptz,
  registration_date_override timestamptz,
  aliases text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := lower(trim(coalesce(p_query, '')));
begin
  if not public.is_milly_admin() then
    raise exception 'Administrator access required';
  end if;
  if char_length(normalized_query) > 80 then
    raise exception 'Search query is too long';
  end if;

  return query
  select p.id, p.display_name, p.username, p.user_number, p.avatar_path,
    p.is_verified, u.created_at, p.registration_date_override,
    coalesce(array_agg(a.username order by a.username) filter (where a.username is not null), '{}'::text[])
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profile_aliases a on a.user_id = p.id
  where normalized_query = ''
    or p.display_name ilike '%' || normalized_query || '%'
    or p.username ilike '%' || ltrim(normalized_query, '@#') || '%'
    or p.user_number::text like ltrim(normalized_query, '@#') || '%'
    or a.username ilike '%' || ltrim(normalized_query, '@#') || '%'
  group by p.id, p.display_name, p.username, p.user_number, p.avatar_path,
    p.is_verified, u.created_at, p.registration_date_override
  order by p.user_number
  limit 100;
end;
$$;

create or replace function public.admin_update_profile(
  p_profile_id uuid,
  p_display_name text,
  p_username text,
  p_user_number bigint,
  p_is_verified boolean,
  p_registration_date_override timestamptz,
  p_aliases text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_aliases text[];
  previous_user_number bigint;
  displaced_user_id uuid;
  temporary_user_number bigint;
begin
  if not public.is_milly_admin() then
    raise exception 'Administrator access required';
  end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 40 then
    raise exception 'Display name must contain 1 to 40 characters';
  end if;
  if coalesce(p_username, '') !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must be 3 to 24 lowercase letters, digits or underscores';
  end if;
  if p_user_number is null or p_user_number < 1 then
    raise exception 'User number must be a positive integer';
  end if;
  if p_registration_date_override > now() then
    raise exception 'Displayed registration date cannot be in the future';
  end if;
  if cardinality(coalesce(p_aliases, '{}')) > 20 then
    raise exception 'A profile can have at most 20 additional usernames';
  end if;

  normalized_aliases := array(
    select distinct lower(trim(value))
    from unnest(coalesce(p_aliases, '{}')) as aliases(value)
    where trim(value) <> ''
  );
  if exists (
    select 1 from unnest(normalized_aliases) as aliases(value)
    where value !~ '^[a-z0-9_]{3,24}$' or value = p_username
  ) then
    raise exception 'Additional usernames must be unique valid usernames and differ from the primary username';
  end if;
  if cardinality(normalized_aliases) <> cardinality(array(
    select distinct lower(trim(value))
    from unnest(coalesce(p_aliases, '{}')) as aliases(value)
  )) then
    raise exception 'Additional usernames contain invalid or duplicate values';
  end if;

  perform pg_advisory_xact_lock(hashtext('milly_profile_admin_updates'));

  select p.user_number into previous_user_number
  from public.profiles p
  where p.id = p_profile_id
  for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id <> p_profile_id and p.username = p_username
  ) then
    raise exception 'Username is already assigned to another account';
  end if;
  if exists (
    select 1
    from public.profile_aliases a
    where (a.username = p_username or a.username = any(normalized_aliases))
      and a.user_id <> p_profile_id
  ) or exists (
    select 1 from public.profiles p
    where p.id <> p_profile_id
      and p.username = any(normalized_aliases)
  ) then
    raise exception 'An additional username is already in use';
  end if;

  select p.id into displaced_user_id
  from public.profiles p
  where p.user_number = p_user_number and p.id <> p_profile_id
  for update;
  if displaced_user_id is not null then
    select coalesce(max(p.user_number), 0) + 1 into temporary_user_number
    from public.profiles p;
    update public.profiles set user_number = temporary_user_number where id = displaced_user_id;
  end if;

  update public.profiles
  set display_name = trim(p_display_name),
      username = p_username,
      user_number = p_user_number,
      is_verified = coalesce(p_is_verified, false),
      registration_date_override = p_registration_date_override
  where id = p_profile_id;

  if displaced_user_id is not null then
    update public.profiles set user_number = previous_user_number where id = displaced_user_id;
  end if;

  delete from public.profile_aliases where user_id = p_profile_id;
  insert into public.profile_aliases (user_id, username)
  select p_profile_id, aliases.value
  from unnest(normalized_aliases) as aliases(value);

  perform setval(
    pg_get_serial_sequence('public.profiles', 'user_number')::regclass,
    greatest((select max(user_number) from public.profiles), 1),
    true
  );
end;
$$;

create or replace function public.admin_list_spaces()
returns table (
  id uuid,
  name text,
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
  select s.id, s.name, s.owner_id, count(m.user_id), s.display_member_count_override
  from public.private_spaces s
  left join public.private_space_members m on m.space_id = s.id
  group by s.id
  order by s.created_at desc
  limit 200;
end;
$$;

create or replace function public.admin_set_space_display_count(p_space_id uuid, p_display_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_milly_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_display_count is not null and p_display_count not between 0 and 1000000000 then
    raise exception 'Displayed member count must be between 0 and 1000000000';
  end if;

  update public.private_spaces
  set display_member_count_override = p_display_count
  where id = p_space_id;
  if not found then
    raise exception 'Space not found';
  end if;
end;
$$;

grant execute on function public.is_milly_admin() to authenticated;
grant execute on function public.search_users(text) to authenticated;
grant execute on function public.admin_search_profiles(text) to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, bigint, boolean, timestamptz, text[]) to authenticated;
grant execute on function public.admin_list_spaces() to authenticated;
grant execute on function public.admin_set_space_display_count(uuid, integer) to authenticated;
revoke all on function public.is_milly_admin() from public, anon;
revoke all on function public.search_users(text) from public, anon;
revoke all on function public.admin_search_profiles(text) from public, anon;
revoke all on function public.admin_update_profile(uuid, text, text, bigint, boolean, timestamptz, text[]) from public, anon;
revoke all on function public.admin_list_spaces() from public, anon;
revoke all on function public.admin_set_space_display_count(uuid, integer) from public, anon;
