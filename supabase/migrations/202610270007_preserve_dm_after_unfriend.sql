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
