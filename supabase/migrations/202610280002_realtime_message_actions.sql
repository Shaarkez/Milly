drop policy if exists "users and friends may read private presence" on realtime.messages;
create policy "users and friends may read private presence"
  on realtime.messages for select to authenticated
  using (
    extension = 'presence'
    and (
      realtime.topic() = 'milly-presence:' || (select auth.uid())::text
      or case
        when realtime.topic() ~ '^milly-presence:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.are_friends(
          (select auth.uid()),
          split_part(realtime.topic(), ':', 2)::uuid
        )
        else false
      end
    )
  );

drop policy if exists "sender may edit own messages" on public.messages;
create policy "sender may edit own messages"
  on public.messages for update to authenticated
  using (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id))
  with check (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));

grant update (body) on public.messages to authenticated;
