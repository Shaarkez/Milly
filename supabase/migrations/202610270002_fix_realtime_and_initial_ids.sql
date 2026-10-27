do $$
declare
  table_name text;
begin
  foreach table_name in array array['messages', 'friend_requests', 'friendships', 'call_signals']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

do $$
declare
  sharkez_id uuid;
  sharkez_old_number bigint;
  rostislav_id uuid;
  rostislav_old_number bigint;
  former_number_one uuid;
  former_number_two uuid;
  temporary_number bigint;
  profile_count integer;
  identity_sequence text;
begin
  select count(*) into profile_count
  from public.profiles
  where username = 'sharkez';

  if profile_count <> 1 then
    raise exception 'Expected exactly one profile with username @sharkez; found %', profile_count;
  end if;

  select id, user_number into sharkez_id, sharkez_old_number
  from public.profiles
  where username = 'sharkez';

  select count(*) into profile_count
  from public.profiles
  where lower(trim(display_name)) = 'ростислав';

  if profile_count <> 1 then
    raise exception 'Expected exactly one profile named Ростислав; found %', profile_count;
  end if;

  select id, user_number into rostislav_id, rostislav_old_number
  from public.profiles
  where lower(trim(display_name)) = 'ростислав';

  if sharkez_id = rostislav_id then
    raise exception '@sharkez and Ростислав must be separate accounts';
  end if;

  select id into former_number_one from public.profiles where user_number = 1;
  select id into former_number_two from public.profiles where user_number = 2;
  select coalesce(max(user_number), 0) + 1 into temporary_number from public.profiles;

  update public.profiles set user_number = temporary_number where id = sharkez_id;
  update public.profiles set user_number = temporary_number + 1 where id = rostislav_id;

  if former_number_one is not null and former_number_one not in (sharkez_id, rostislav_id) then
    update public.profiles set user_number = temporary_number + 2 where id = former_number_one;
  end if;

  if former_number_two is not null and former_number_two not in (sharkez_id, rostislav_id) then
    update public.profiles set user_number = temporary_number + 3 where id = former_number_two;
  end if;

  update public.profiles set user_number = 1 where id = sharkez_id;
  update public.profiles set user_number = 2 where id = rostislav_id;

  if former_number_one is not null and former_number_one not in (sharkez_id, rostislav_id) then
    update public.profiles
    set user_number = case when sharkez_old_number not in (1, 2) then sharkez_old_number else temporary_number + 4 end
    where id = former_number_one;
  end if;

  if former_number_two is not null and former_number_two not in (sharkez_id, rostislav_id) then
    update public.profiles
    set user_number = case when rostislav_old_number not in (1, 2) then rostislav_old_number else temporary_number + 5 end
    where id = former_number_two;
  end if;

  identity_sequence := pg_get_serial_sequence('public.profiles', 'user_number');
  if identity_sequence is not null then
    perform setval(identity_sequence::regclass, greatest((select max(user_number) from public.profiles), 1), true);
  end if;
end;
$$;
