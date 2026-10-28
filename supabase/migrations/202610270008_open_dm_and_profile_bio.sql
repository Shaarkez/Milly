alter table public.profiles
  add column bio text not null default ''
  check (char_length(bio) <= 160);

grant update (bio) on public.profiles to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;

create or replace function public.can_view_profile(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_target = (select auth.uid())
    or public.are_friends((select auth.uid()), p_target)
    or exists (
      select 1 from public.friend_requests r
      where r.status = 'pending'
        and ((r.sender_id = (select auth.uid()) and r.receiver_id = p_target)
          or (r.receiver_id = (select auth.uid()) and r.sender_id = p_target))
    )
    or exists (
      select 1 from public.conversations c
      where (c.user_low = (select auth.uid()) and c.user_high = p_target)
        or (c.user_high = (select auth.uid()) and c.user_low = p_target)
    );
$$;

create or replace function public.get_or_create_dm(peer_uid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester uuid := (select auth.uid());
  conversation_id uuid;
begin
  if requester is null then
    raise exception 'Authentication is required to open a conversation';
  end if;

  if peer_uid is null or peer_uid = requester or not exists (
    select 1 from public.profiles p where p.id = peer_uid
  ) then
    raise exception 'A valid other user is required to open a conversation';
  end if;

  insert into public.conversations (user_low, user_high)
  values (least(requester, peer_uid), greatest(requester, peer_uid))
  on conflict (user_low, user_high) do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;

  return conversation_id;
end;
$$;
