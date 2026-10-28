-- johnplusnews: record dictionary look-ups made by signed-in members.
-- Run once in the Supabase project uovqsqnxcgvefxpxntcj (SQL editor). Safe to run twice.

create table if not exists public.news_lookups (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug       text not null,
  level      text not null default '',
  word       text not null check (char_length(word) between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists news_lookups_user_idx on public.news_lookups (user_id, created_at desc);
create index if not exists news_lookups_word_idx on public.news_lookups (lower(word));

alter table public.news_lookups enable row level security;

drop policy if exists "news lookups read" on public.news_lookups;
drop policy if exists "news lookups add"  on public.news_lookups;
create policy "news lookups read" on public.news_lookups for select to authenticated
  using (user_id = auth.uid() or public.news_is_teacher());
create policy "news lookups add"  on public.news_lookups for insert to authenticated
  with check (user_id = auth.uid());

-- members can add and read their own rows, never change or delete them; deleting an account removes them
grant select, insert on public.news_lookups to authenticated;
revoke all on public.news_lookups from anon;
