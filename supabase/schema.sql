-- johnplusnews accounts: run this once in the SQL editor of the project that holds the sign-ins (the book42 project).
--
-- This script ONLY CREATES NEW THINGS, and every name starts with news_ so nothing existing can be touched.
-- It has no drop table, no delete, no alter on any existing table, and no trigger on the shared sign-up table.
-- It is safe to run again: every statement can be repeated.

-- 1. Tables ------------------------------------------------------------------------------------------

create table if not exists public.news_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text default (auth.jwt() ->> 'email'),
  display_name text,
  role         text not null default 'student' check (role in ('student', 'teacher')),
  created_at   timestamptz not null default now()
);

create table if not exists public.news_words (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug       text not null,
  level      text not null,
  text       text not null check (char_length(text) between 1 and 200),
  sentence   text check (char_length(sentence) <= 800),
  start_pos  integer,
  end_pos    integer,
  created_at timestamptz not null default now(),
  unique (user_id, slug, level, text)
);
create index if not exists news_words_slug_idx on public.news_words (slug);

create table if not exists public.news_progress (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug       text not null,
  level      text,
  status     text not null default 'opened' check (status in ('opened', 'finished')),
  updated_at timestamptz not null default now(),
  primary key (user_id, slug)
);

create table if not exists public.news_prefs (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  font          text,
  level         text,
  timer_minutes integer check (timer_minutes between 1 and 180),
  updated_at    timestamptz not null default now()
);

-- 2. Who is a teacher? Only a row in news_profiles with role = 'teacher', which only you can set (step 6) ---

create or replace function public.news_is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.news_profiles where id = auth.uid() and role = 'teacher');
$$;

-- 3. Row level security: students see only their own rows, teachers can read everything --------------------

alter table public.news_profiles enable row level security;
alter table public.news_words    enable row level security;
alter table public.news_progress enable row level security;
alter table public.news_prefs    enable row level security;

drop policy if exists "news profiles read"   on public.news_profiles;
drop policy if exists "news profiles add"    on public.news_profiles;
drop policy if exists "news profiles update" on public.news_profiles;
create policy "news profiles read"   on public.news_profiles for select to authenticated using (id = auth.uid() or public.news_is_teacher());
create policy "news profiles add"    on public.news_profiles for insert to authenticated with check (id = auth.uid());
create policy "news profiles update" on public.news_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "news words read"   on public.news_words;
drop policy if exists "news words add"    on public.news_words;
drop policy if exists "news words change" on public.news_words;
drop policy if exists "news words delete" on public.news_words;
create policy "news words read"   on public.news_words for select to authenticated using (user_id = auth.uid() or public.news_is_teacher());
create policy "news words add"    on public.news_words for insert to authenticated with check (user_id = auth.uid());
create policy "news words change" on public.news_words for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "news words delete" on public.news_words for delete to authenticated using (user_id = auth.uid());

drop policy if exists "news progress read"   on public.news_progress;
drop policy if exists "news progress add"    on public.news_progress;
drop policy if exists "news progress change" on public.news_progress;
create policy "news progress read"   on public.news_progress for select to authenticated using (user_id = auth.uid() or public.news_is_teacher());
create policy "news progress add"    on public.news_progress for insert to authenticated with check (user_id = auth.uid());
create policy "news progress change" on public.news_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "news prefs read"   on public.news_prefs;
drop policy if exists "news prefs add"    on public.news_prefs;
drop policy if exists "news prefs change" on public.news_prefs;
create policy "news prefs read"   on public.news_prefs for select to authenticated using (user_id = auth.uid());
create policy "news prefs add"    on public.news_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "news prefs change" on public.news_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. Permissions on the new tables only: signed-out visitors get nothing, and nobody can set their own role ----

revoke all on public.news_profiles, public.news_words, public.news_progress, public.news_prefs from anon;
revoke all on public.news_profiles from authenticated;
grant  select on public.news_profiles to authenticated;
grant  insert (id, display_name) on public.news_profiles to authenticated;
grant  update (display_name) on public.news_profiles to authenticated;
grant  select, insert, update, delete on public.news_words    to authenticated;
grant  select, insert, update         on public.news_progress to authenticated;
grant  select, insert, update         on public.news_prefs    to authenticated;

-- 5. Let a person delete their own account (run this on its own if you already ran the sections above) ------------
-- It removes the person's sign-in; their saved words, progress, preferences and news profile are removed with it.
-- It does nothing to anyone else and does not touch Book42's tables.

create or replace function public.news_delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.news_delete_my_account() from public, anon;
grant execute on function public.news_delete_my_account() to authenticated;

-- 6. Make yourself the teacher (after you have created your own account on the news site) ---------------------
-- Replace the address with the one you signed up with, then run just this line:
--
--   update public.news_profiles set role = 'teacher' where email = 'you@example.com';
