create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  avatar_path text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id, group_id);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text check (body is null or char_length(body) <= 4000),
  image_path text,
  created_at timestamptz not null default now(),
  constraint group_message_has_content check (nullif(trim(body), '') is not null or image_path is not null)
);

create index if not exists group_messages_created_idx on public.group_messages (group_id, created_at desc);

create table if not exists public.group_message_reactions (
  id bigint generated always as identity primary key,
  group_message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '👍', '🔥')),
  created_at timestamptz not null default now(),
  unique (group_message_id, user_id, emoji)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_message_reactions enable row level security;

create or replace function public.is_group_member(p_group uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = (select auth.uid())
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = p_group and gm.user_id = p_user
    );
$$;

create or replace function public.is_conversation_member(p_conversation uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = (select auth.uid())
    and (
      exists (
        select 1 from public.conversations c
        where c.id = p_conversation and p_user in (c.user_low, c.user_high)
      )
      or public.is_group_member(p_conversation, p_user)
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
    )
    or exists (
      select 1 from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = p_target
    );
$$;

create or replace function public.create_group(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_group uuid;
begin
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'Group name must contain 1 to 40 characters';
  end if;
  if coalesce(cardinality(p_member_ids), 0) not between 1 and 49 then
    raise exception 'Select between 1 and 49 contacts';
  end if;
  if exists (
    select 1
    from unnest(p_member_ids) as selected(user_id)
    group by selected.user_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate group members are not allowed';
  end if;
  if exists (
    select 1 from unnest(p_member_ids) as selected(user_id)
    where selected.user_id = (select auth.uid())
      or not public.are_friends((select auth.uid()), selected.user_id)
  ) then
    raise exception 'Group members must be your contacts';
  end if;

  insert into public.groups (name, created_by)
  values (trim(p_name), (select auth.uid()))
  returning id into created_group;

  insert into public.group_members (group_id, user_id, role)
  values (created_group, (select auth.uid()), 'owner');

  insert into public.group_members (group_id, user_id)
  select created_group, selected.user_id
  from unnest(p_member_ids) as selected(user_id);

  return created_group;
end;
$$;

create or replace function public.touch_group_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.groups set updated_at = new.created_at where id = new.group_id;
  return new;
end;
$$;

drop trigger if exists group_messages_touch_group on public.group_messages;
create trigger group_messages_touch_group
  after insert on public.group_messages
  for each row execute function public.touch_group_updated_at();

create policy "group members may read groups"
  on public.groups for select to authenticated
  using (public.is_group_member(id));
create policy "group owners may update group details"
  on public.groups for update to authenticated
  using (created_by = (select auth.uid()) and public.is_group_member(id))
  with check (created_by = (select auth.uid()) and public.is_group_member(id));

create policy "group members may read membership"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "group members may read messages"
  on public.group_messages for select to authenticated
  using (public.is_group_member(group_id));
create policy "group members may send their own messages"
  on public.group_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_group_member(group_id));
create policy "senders may edit their own group messages"
  on public.group_messages for update to authenticated
  using (sender_id = (select auth.uid()) and public.is_group_member(group_id))
  with check (sender_id = (select auth.uid()) and public.is_group_member(group_id));
create policy "senders may delete their own group messages"
  on public.group_messages for delete to authenticated
  using (sender_id = (select auth.uid()) and public.is_group_member(group_id));

create policy "group members may read message reactions"
  on public.group_message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.group_messages gm
      where gm.id = group_message_id and public.is_group_member(gm.group_id)
    )
  );
create policy "users may add their own group message reactions"
  on public.group_message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.group_messages gm
      where gm.id = group_message_id and public.is_group_member(gm.group_id)
    )
  );
create policy "users may remove their own group message reactions"
  on public.group_message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.groups, public.group_members, public.group_messages, public.group_message_reactions to authenticated;
grant update (avatar_path) on public.groups to authenticated;
grant insert, update, delete on public.group_messages to authenticated;
grant insert, delete on public.group_message_reactions to authenticated;
grant usage, select on sequence public.group_message_reactions_id_seq to authenticated;
grant execute on function public.create_group(text, uuid[]) to authenticated;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
revoke all on function public.create_group(text, uuid[]) from public, anon;
revoke all on function public.is_group_member(uuid, uuid) from public, anon;

do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_members;
exception when duplicate_object then null;
end $$;
