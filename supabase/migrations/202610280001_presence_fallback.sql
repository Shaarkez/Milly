alter table public.profiles
  add column if not exists last_seen_at timestamptz;

grant update (last_seen_at) on public.profiles to authenticated;
