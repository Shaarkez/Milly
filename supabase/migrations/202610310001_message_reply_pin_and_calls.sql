alter table public.messages
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.profiles(id) on delete set null,
  add column if not exists system_kind text;

alter table public.group_messages
  add column if not exists reply_to_id uuid references public.group_messages(id) on delete set null,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.profiles(id) on delete set null,
  add column if not exists system_kind text;

alter table public.messages drop constraint if exists messages_system_kind_check;
alter table public.messages add constraint messages_system_kind_check
  check (system_kind is null or system_kind in ('missed_call', 'declined_call', 'ended_call'));

alter table public.group_messages drop constraint if exists group_messages_system_kind_check;
alter table public.group_messages add constraint group_messages_system_kind_check
  check (system_kind is null or system_kind in ('missed_call', 'declined_call', 'ended_call'));

create index if not exists messages_reply_idx on public.messages(reply_to_id);
create index if not exists messages_pinned_idx on public.messages(conversation_id, pinned_at desc);
create index if not exists group_messages_reply_idx on public.group_messages(reply_to_id);
create index if not exists group_messages_pinned_idx on public.group_messages(group_id, pinned_at desc);

alter table public.group_message_reactions drop constraint if exists group_message_reactions_emoji_check;
alter table public.group_message_reactions add constraint group_message_reactions_emoji_check
  check (emoji in ('❤️', '👍', '🔥', '😂'));

create or replace function public.pin_dm_message(p_message uuid, p_pin boolean)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare pinned timestamptz; target public.messages%rowtype;
begin
  select * into target from public.messages where id = p_message;
  if target.id is null or not public.is_conversation_member(target.conversation_id) then
    raise exception 'Message is not in an accessible conversation';
  end if;
  pinned := case when p_pin then now() else null end;
  update public.messages set pinned_at = pinned, pinned_by = case when p_pin then auth.uid() else null end where id = p_message;
  return pinned;
end $$;

create or replace function public.pin_group_message(p_message uuid, p_pin boolean)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare pinned timestamptz; target public.group_messages%rowtype;
begin
  select * into target from public.group_messages where id = p_message;
  if target.id is null or not public.is_group_member(target.group_id) then
    raise exception 'Message is not in an accessible group';
  end if;
  pinned := case when p_pin then now() else null end;
  update public.group_messages set pinned_at = pinned, pinned_by = case when p_pin then auth.uid() else null end where id = p_message;
  return pinned;
end $$;

grant execute on function public.pin_dm_message(uuid, boolean) to authenticated;
grant execute on function public.pin_group_message(uuid, boolean) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['messages', 'group_messages'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
