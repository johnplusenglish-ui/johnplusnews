-- johnplusnews: let people delete their own account. Run once in the Supabase SQL editor. It only adds one function.

-- 6. Let a person delete their own account (run this on its own if you already ran the sections above) ------------
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
