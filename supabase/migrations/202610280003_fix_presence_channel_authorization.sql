grant select on realtime.messages to authenticated;

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
