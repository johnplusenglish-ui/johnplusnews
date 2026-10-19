-- johnplusnews accounts: run this once in the Supabase SQL editor of the NEW johnplusnews project.
-- It is safe to run again: every statement can be repeated.

-- 1. Tables ------------------------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'student' check (role in ('student', 'teacher')),
  created_at   timestamptz not null default now()
);

create table if not exists public.words (
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
create index if not exists words_slug_idx on public.words (slug);

create table if not exists public.progress (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug       text not null,
  level      text,
  status     text not null default 'opened' check (status in ('opened', 'finished')),
  updated_at timestamptz not null default now(),
  primary key (user_id, slug)
);

create table if not exists public.prefs (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  font          text,
  level         text,
  timer_minutes integer check (timer_minutes between 1 and 180),
  updated_at    timestamptz not null default now()
);

-- 2. A profile is made automatically for every new account (always a student) ---------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts made before this script was run still get a profile
insert into public.profiles (id, email, display_name)
select id, email, left(coalesce(raw_user_meta_data ->> 'display_name', ''), 60) from auth.users
on conflict (id) do nothing;

-- 3. Who is a teacher? Only a row in profiles with role = 'teacher', which only you can set (step 6) ---

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

-- 4. Row level security: students see only their own rows, teachers can read everything ---------------

alter table public.profiles enable row level security;
alter table public.words    enable row level security;
alter table public.progress enable row level security;
alter table public.prefs    enable row level security;

drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read"   on public.profiles for select to authenticated using (id = auth.uid() or public.is_teacher());
create policy "profiles update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "words read"   on public.words;
drop policy if exists "words add"    on public.words;
drop policy if exists "words change" on public.words;
drop policy if exists "words delete" on public.words;
create policy "words read"   on public.words for select to authenticated using (user_id = auth.uid() or public.is_teacher());
create policy "words add"    on public.words for insert to authenticated with check (user_id = auth.uid());
create policy "words change" on public.words for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "words delete" on public.words for delete to authenticated using (user_id = auth.uid());

drop policy if exists "progress read"   on public.progress;
drop policy if exists "progress add"    on public.progress;
drop policy if exists "progress change" on public.progress;
create policy "progress read"   on public.progress for select to authenticated using (user_id = auth.uid() or public.is_teacher());
create policy "progress add"    on public.progress for insert to authenticated with check (user_id = auth.uid());
create policy "progress change" on public.progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "prefs read"   on public.prefs;
drop policy if exists "prefs add"    on public.prefs;
drop policy if exists "prefs change" on public.prefs;
create policy "prefs read"   on public.prefs for select to authenticated using (user_id = auth.uid());
create policy "prefs add"    on public.prefs for insert to authenticated with check (user_id = auth.uid());
create policy "prefs change" on public.prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5. Permissions: nobody who is signed out can touch anything, and nobody can change their own role ----

revoke all on public.profiles, public.words, public.progress, public.prefs from anon;
revoke update on public.profiles from authenticated;
grant  update (display_name) on public.profiles to authenticated;
grant  select on public.profiles to authenticated;
grant  select, insert, update, delete on public.words    to authenticated;
grant  select, insert, update         on public.progress to authenticated;
grant  select, insert, update         on public.prefs    to authenticated;

-- 6. Make yourself the teacher (after you have created your own account on the site) ----------------
-- Replace the address with the one you signed up with, then run just this line:
--
--   update public.profiles set role = 'teacher' where email = 'you@example.com';
