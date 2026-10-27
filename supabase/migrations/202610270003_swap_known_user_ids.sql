do $$
declare
  sharkez_uid constant uuid := '6a3ecd6f-7f0a-424a-a02d-ef133f23003a';
  rostislav_uid constant uuid := '40dd0ff9-5562-4170-8ccd-2e2b3bed5d73';
  sharkez_number bigint;
  rostislav_number bigint;
  number_one_owner uuid;
  number_two_owner uuid;
  temporary_number bigint;
  identity_sequence text;
begin
  lock table public.profiles in access exclusive mode;

  select user_number into sharkez_number
  from public.profiles
  where id = sharkez_uid;
  if not found then
    raise exception 'Sharkez profile % was not found', sharkez_uid;
  end if;

  select user_number into rostislav_number
  from public.profiles
  where id = rostislav_uid;
  if not found then
    raise exception 'Rostislav profile % was not found', rostislav_uid;
  end if;

  if sharkez_number = 1 and rostislav_number = 2 then
    raise notice 'IDs are already assigned: Sharkez #1, Rostislav #2';
    return;
  end if;

  select id into number_one_owner from public.profiles where user_number = 1;
  select id into number_two_owner from public.profiles where user_number = 2;

  if number_one_owner is not null and number_one_owner not in (sharkez_uid, rostislav_uid) then
    raise exception 'ID #1 belongs to an unexpected profile %; no IDs were changed', number_one_owner;
  end if;
  if number_two_owner is not null and number_two_owner not in (sharkez_uid, rostislav_uid) then
    raise exception 'ID #2 belongs to an unexpected profile %; no IDs were changed', number_two_owner;
  end if;

  select coalesce(max(user_number), 0) + 1 into temporary_number
  from public.profiles;

  update public.profiles set user_number = temporary_number where id = sharkez_uid;
  update public.profiles set user_number = temporary_number + 1 where id = rostislav_uid;
  update public.profiles set user_number = 1 where id = sharkez_uid;
  update public.profiles set user_number = 2 where id = rostislav_uid;

  identity_sequence := pg_get_serial_sequence('public.profiles', 'user_number');
  if identity_sequence is not null then
    perform setval(identity_sequence::regclass, greatest((select max(user_number) from public.profiles), 1), true);
  end if;
end;
$$;
