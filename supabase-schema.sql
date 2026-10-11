-- Run this once in the Supabase SQL Editor before enabling account sync.
create table if not exists public.user_libraries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_libraries_data_is_object check (jsonb_typeof(data) = 'object')
);

alter table public.user_libraries enable row level security;

drop policy if exists "Users can read their own library" on public.user_libraries;
create policy "Users can read their own library"
  on public.user_libraries for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own library" on public.user_libraries;
create policy "Users can create their own library"
  on public.user_libraries for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own library" on public.user_libraries;
create policy "Users can update their own library"
  on public.user_libraries for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_libraries to authenticated;
revoke all on public.user_libraries from anon;

-- Enable Supabase Realtime broadcast for user libraries
alter publication supabase_realtime add table public.user_libraries;
