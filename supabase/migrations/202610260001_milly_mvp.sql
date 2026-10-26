create extension if not exists pgcrypto with schema extensions;

create or replace function public.generate_milly_id()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'MILLY-' || upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  milly_id text not null unique default public.generate_milly_id(),
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  avatar_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  constraint friend_request_not_self check (sender_id <> receiver_id)
);

create unique index if not exists friend_requests_pending_pair_idx
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';

create table if not exists public.friendships (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  constraint friendship_sorted_pair check (user_low < user_high)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (user_low, user_high),
  constraint conversation_sorted_pair check (user_low < user_high)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text check (body is null or char_length(body) <= 4000),
  image_path text,
  created_at timestamptz not null default now(),
  constraint message_has_content check (nullif(trim(body), '') is not null or image_path is not null)
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create table if not exists public.call_signals (
  id bigint generated always as identity primary key,
  call_id uuid not null,
  from_uid uuid not null references public.profiles(id) on delete cascade,
  to_uid uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('offer', 'answer', 'ice', 'reject', 'hangup')),
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint call_signal_not_self check (from_uid <> to_uid)
);

create index if not exists call_signals_recipient_idx
  on public.call_signals (to_uid, created_at desc);

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where (select auth.uid()) in (p_a, p_b)
      and f.user_low = least(p_a, p_b) and f.user_high = greatest(p_a, p_b)
  );
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
    );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Новый участник')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_milly on auth.users;
create trigger on_auth_user_created_milly
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.search_user_by_milly_id(lookup_id text)
returns table (id uuid, milly_id text, display_name text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.milly_id, p.display_name, p.avatar_path
  from public.profiles p
  where p.milly_id = upper(trim(lookup_id))
    and p.id <> (select auth.uid())
  limit 1;
$$;

create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester uuid;
  recipient uuid;
begin
  select r.sender_id, r.receiver_id into requester, recipient
  from public.friend_requests r
  where r.id = request_id and r.status = 'pending'
  for update;

  if recipient is null or recipient <> (select auth.uid()) then
    raise exception 'Friend request not found or not addressed to this user';
  end if;

  update public.friend_requests set status = 'accepted' where id = request_id;
  insert into public.friendships (user_low, user_high)
  values (least(requester, recipient), greatest(requester, recipient))
  on conflict do nothing;
end;
$$;

create or replace function public.get_or_create_dm(peer_uid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
begin
  if peer_uid = (select auth.uid()) or not public.are_friends((select auth.uid()), peer_uid) then
    raise exception 'A friendship is required to open a conversation';
  end if;

  insert into public.conversations (user_low, user_high)
  values (least((select auth.uid()), peer_uid), greatest((select auth.uid()), peer_uid))
  on conflict (user_low, user_high) do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;

  return conversation_id;
end;
$$;

create or replace function public.is_conversation_member(p_conversation uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where p_user = (select auth.uid())
      and c.id = p_conversation and p_user in (c.user_low, c.user_high)
  );
$$;

alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.call_signals enable row level security;

create policy "profiles visible to owner, friends and request peers"
  on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy "profile owner may update profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "request participants may read requests"
  on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (sender_id, receiver_id));
create policy "users may send friend requests"
  on public.friend_requests for insert to authenticated
  with check (
    sender_id = (select auth.uid()) and receiver_id <> (select auth.uid())
    and not public.are_friends(sender_id, receiver_id)
  );
create policy "recipient may decline a request"
  on public.friend_requests for update to authenticated
  using (receiver_id = (select auth.uid()) and status = 'pending')
  with check (receiver_id = (select auth.uid()) and status in ('pending', 'declined'));

create policy "friends may read their friendship"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));
create policy "either friend may end a friendship"
  on public.friendships for delete to authenticated
  using ((select auth.uid()) in (user_low, user_high));

create policy "conversation members may read conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));

create policy "conversation members may read messages"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy "members may send messages as themselves"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));
create policy "sender may delete own messages"
  on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));

create policy "call participants may receive signaling"
  on public.call_signals for select to authenticated
  using ((select auth.uid()) in (from_uid, to_uid));
create policy "friends may signal one another"
  on public.call_signals for insert to authenticated
  with check (
    from_uid = (select auth.uid()) and to_uid <> (select auth.uid())
    and public.are_friends(from_uid, to_uid)
    and kind in ('offer', 'answer', 'ice', 'reject', 'hangup')
  );

grant execute on function public.search_user_by_milly_id(text) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
revoke all on function public.generate_milly_id() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.search_user_by_milly_id(text) from public, anon;
revoke all on function public.accept_friend_request(uuid) from public, anon;
revoke all on function public.get_or_create_dm(uuid) from public, anon;
revoke all on function public.are_friends(uuid, uuid) from public, anon;
revoke all on function public.can_view_profile(uuid) from public, anon;
revoke all on function public.is_conversation_member(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
revoke all on public.profiles, public.friend_requests, public.friendships,
  public.conversations, public.messages, public.call_signals from anon, authenticated;
grant select on public.profiles, public.friend_requests, public.friendships,
  public.conversations, public.messages, public.call_signals to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
grant insert on public.friend_requests to authenticated;
grant update (status) on public.friend_requests to authenticated;
grant delete on public.friendships, public.messages to authenticated;
grant insert on public.messages, public.call_signals to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('milly-media', 'milly-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  ('milly-avatars', 'milly-avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "conversation members may view chat images"
  on storage.objects for select to authenticated
  using (bucket_id = 'milly-media' and public.is_conversation_member((storage.foldername(name))[1]::uuid));
create policy "members may upload their own chat images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'milly-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.is_conversation_member((storage.foldername(name))[1]::uuid)
  );
create policy "avatar owners and friends may read avatars"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'milly-avatars'
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and public.can_view_profile(p.id)
    )
  );
create policy "users may upload their own avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'milly-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "users may replace their own avatars"
  on storage.objects for update to authenticated
  using (bucket_id = 'milly-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'milly-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users may delete their own files"
  on storage.objects for delete to authenticated
  using (
    (bucket_id = 'milly-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
    or (bucket_id = 'milly-media' and (storage.foldername(name))[2] = (select auth.uid())::text
      and public.is_conversation_member((storage.foldername(name))[1]::uuid))
  );

create policy "users and friends may read private presence"
  on realtime.messages for select to authenticated
  using (
    extension = 'presence'
    and (
      realtime.topic() = 'milly-presence:' || (select auth.uid())::text
      or exists (
        select 1 from public.friendships f
        where (f.user_low = (select auth.uid()) and realtime.topic() = 'milly-presence:' || f.user_high::text)
          or (f.user_high = (select auth.uid()) and realtime.topic() = 'milly-presence:' || f.user_low::text)
      )
    )
  );
create policy "users may publish their own private presence"
  on realtime.messages for insert to authenticated
  with check (
    extension = 'presence'
    and realtime.topic() = 'milly-presence:' || (select auth.uid())::text
  );

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friend_requests;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.call_signals;
exception when duplicate_object then null;
end $$;