-- Lets a signed-in person delete their own account from inside the app.
-- Removing the auth.users row cascades to user_records (see 0001), so every
-- synced row goes with it. security definer is what lets it touch the auth
-- schema; it only ever acts on auth.uid(), the caller's own id.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  delete from public.user_records where user_id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
