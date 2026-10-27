create table if not exists public.private_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 48),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.private_space_members (
  space_id uuid not null references public.private_spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index if not exists private_space_members_user_idx
  on public.private_space_members (user_id, space_id);

create table if not exists public.private_space_channels (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.private_spaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 32),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (space_id, name)
);

create index if not exists private_space_channels_space_idx
  on public.private_space_channels (space_id, created_at);

create table if not exists public.private_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.private_space_channels(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists private_channel_messages_channel_created_idx
  on public.private_channel_messages (channel_id, created_at desc);

create table if not exists public.message_reactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  channel_message_id uuid references public.private_channel_messages(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🔥', '😮', '😢')),
  created_at timestamptz not null default now(),
  constraint message_reaction_single_target check (
    (message_id is not null and channel_message_id is null)
    or (message_id is null and channel_message_id is not null)
  )
);

create unique index if not exists message_reactions_dm_unique_idx
  on public.message_reactions (message_id, user_id, emoji)
  where message_id is not null;
create unique index if not exists message_reactions_channel_unique_idx
  on public.message_reactions (channel_message_id, user_id, emoji)
  where channel_message_id is not null;
create index if not exists message_reactions_dm_message_idx
  on public.message_reactions (message_id) where message_id is not null;
create index if not exists message_reactions_channel_message_idx
  on public.message_reactions (channel_message_id) where channel_message_id is not null;

create or replace function public.is_private_space_member(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.private_space_members m
    where m.space_id = p_space and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_private_channel_member(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.private_space_channels c
    join public.private_space_members m on m.space_id = c.space_id
    where c.id = p_channel and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.create_private_space(space_name text, invited_user_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator uuid := (select auth.uid());
  new_space uuid;
begin
  if creator is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(coalesce(space_name, ''))) not between 2 and 48 then
    raise exception 'Space name must contain 2 to 48 characters';
  end if;
  if cardinality(coalesce(invited_user_ids, '{}')) > 100 then
    raise exception 'A space can have at most 100 invited friends';
  end if;
  if exists (
    select 1
    from unnest(coalesce(invited_user_ids, '{}')) as invite(user_id)
    where invite.user_id = creator
       or not public.are_friends(creator, invite.user_id)
  ) then
    raise exception 'You can only invite your friends';
  end if;

  insert into public.private_spaces (name, owner_id)
  values (trim(space_name), creator)
  returning id into new_space;

  insert into public.private_space_members (space_id, user_id, role)
  values (new_space, creator, 'owner');

  insert into public.private_space_members (space_id, user_id)
  select new_space, invite.user_id
  from (select distinct unnest(coalesce(invited_user_ids, '{}')) as user_id) invite
  on conflict do nothing;

  insert into public.private_space_channels (space_id, name, created_by)
  values (new_space, 'общий', creator);

  return new_space;
end;
$$;

create or replace function public.create_private_space_channel(p_space uuid, channel_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator uuid := (select auth.uid());
  new_channel uuid;
begin
  if creator is null or not exists (
    select 1 from public.private_space_members m
    where m.space_id = p_space and m.user_id = creator and m.role = 'owner'
  ) then
    raise exception 'Only the space owner can create channels';
  end if;
  if char_length(trim(coalesce(channel_name, ''))) not between 2 and 32 then
    raise exception 'Channel name must contain 2 to 32 characters';
  end if;

  insert into public.private_space_channels (space_id, name, created_by)
  values (p_space, lower(trim(channel_name)), creator)
  returning id into new_channel;

  return new_channel;
end;
$$;

alter table public.private_spaces enable row level security;
alter table public.private_space_members enable row level security;
alter table public.private_space_channels enable row level security;
alter table public.private_channel_messages enable row level security;
alter table public.message_reactions enable row level security;

create policy "space members may view spaces"
  on public.private_spaces for select to authenticated
  using (public.is_private_space_member(id));
create policy "space members may view membership"
  on public.private_space_members for select to authenticated
  using (public.is_private_space_member(space_id));
create policy "space members may view channels"
  on public.private_space_channels for select to authenticated
  using (public.is_private_space_member(space_id));
create policy "space members may read channel messages"
  on public.private_channel_messages for select to authenticated
  using (public.is_private_channel_member(channel_id));
create policy "space members may send channel messages"
  on public.private_channel_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_private_channel_member(channel_id));
create policy "conversation members may view reactions"
  on public.message_reactions for select to authenticated
  using (
    (message_id is not null and exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_conversation_member(m.conversation_id)
    ))
    or (channel_message_id is not null and exists (
      select 1 from public.private_channel_messages m
      where m.id = channel_message_id and public.is_private_channel_member(m.channel_id)
    ))
  );
create policy "members may add their own reactions"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (message_id is not null and exists (
        select 1 from public.messages m
        where m.id = message_id and public.is_conversation_member(m.conversation_id)
      ))
      or (channel_message_id is not null and exists (
        select 1 from public.private_channel_messages m
        where m.id = channel_message_id and public.is_private_channel_member(m.channel_id)
      ))
    )
  );
create policy "users may remove their own reactions"
  on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.private_spaces, public.private_space_members,
  public.private_space_channels, public.private_channel_messages,
  public.message_reactions from anon, authenticated;
grant select on public.private_spaces, public.private_space_members,
  public.private_space_channels, public.private_channel_messages,
  public.message_reactions to authenticated;
grant insert on public.private_channel_messages, public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;
grant usage, select on sequence public.message_reactions_id_seq to authenticated;

grant execute on function public.create_private_space(text, uuid[]) to authenticated;
grant execute on function public.create_private_space_channel(uuid, text) to authenticated;
grant execute on function public.is_private_space_member(uuid) to authenticated;
grant execute on function public.is_private_channel_member(uuid) to authenticated;
revoke all on function public.create_private_space(text, uuid[]) from public, anon;
revoke all on function public.create_private_space_channel(uuid, text) from public, anon;
revoke all on function public.is_private_space_member(uuid) from public, anon;
revoke all on function public.is_private_channel_member(uuid) from public, anon;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'private_spaces',
    'private_space_members',
    'private_space_channels',
    'private_channel_messages',
    'message_reactions'
  ]
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
