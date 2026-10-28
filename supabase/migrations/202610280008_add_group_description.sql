alter table public.groups
  add column if not exists description text
  check (description is null or char_length(description) <= 160);

grant update (description) on public.groups to authenticated;
