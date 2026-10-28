-- Remember when each member was last here, so the teacher view can show the exact time.
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query > paste > Run).
-- It is safe to run again. It does not touch anyone's words, progress or preferences, and it does not touch
-- Book42's tables.
--
-- The time is set by the database clock, not by the browser, so nobody can change it from the site. Members
-- cannot write the column themselves; the only way in is the news_touch() function below, which can only ever
-- stamp the signed-in person's own row.

alter table public.news_profiles add column if not exists last_seen_at timestamptz;

create or replace function public.news_touch()
returns void
language sql
security definer
set search_path = public
as $$
  update public.news_profiles set last_seen_at = now() where id = auth.uid();
$$;

revoke all on function public.news_touch() from public, anon;
grant execute on function public.news_touch() to authenticated;
