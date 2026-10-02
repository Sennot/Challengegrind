-- ChallengeGrind — security hardening (audit 2026-10-02)

------------------------------------------------------------------------------
-- 1. Banned staff lose all powers (my_rank drives every permission check)
------------------------------------------------------------------------------
create or replace function public.my_rank() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when p.banned then 0 else public.role_rank(p.role) end
       from public.profiles p where p.id = auth.uid()),
    -1)
$$;

-- Banned users can't be given a role
create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller int := public.my_rank();
  target public.app_role;
  target_banned boolean;
begin
  perform public.require_rank(3);
  if p_user_id = auth.uid() then raise exception 'cannot change your own role'; end if;
  select role, banned into target, target_banned from public.profiles where id = p_user_id;
  if not found then raise exception 'user not found'; end if;
  if target_banned and p_role <> 'player' then raise exception 'unban the user first'; end if;
  if public.role_rank(target) >= caller or public.role_rank(p_role) >= caller then
    raise exception 'insufficient permissions' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end $$;

------------------------------------------------------------------------------
-- 2. Ban also signs the user out everywhere (refresh tokens die with sessions)
------------------------------------------------------------------------------
create or replace function public.set_user_ban(p_user_id uuid, p_banned boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.app_role;
begin
  perform public.require_rank(3);
  if p_user_id = auth.uid() then raise exception 'cannot ban yourself'; end if;
  select role into target from public.profiles where id = p_user_id;
  if not found then raise exception 'user not found'; end if;
  if public.role_rank(target) >= public.my_rank() then
    raise exception 'insufficient permissions' using errcode = '42501';
  end if;

  update public.profiles
     set banned = p_banned,
         ban_reason = case when p_banned then nullif(trim(p_reason), '') else null end,
         role = case when p_banned then 'player'::public.app_role else role end
   where id = p_user_id;

  if p_banned then
    update public.records
       set status = 'rejected', reviewer_id = auth.uid(), reviewed_at = now(), review_note = 'Игрок заблокирован'
     where player_id = p_user_id and status = 'pending';
    delete from auth.sessions where user_id = p_user_id;
  end if;
end $$;

-- Used by the admin-reset-password Edge Function (service_role only)
create or replace function public.admin_revoke_sessions(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

------------------------------------------------------------------------------
-- 3. Account identity: internal email must be exactly <lower(username)>@users.challengegrind.local
--    Blocks squatting a nickname by signing up with its email under another username,
--    and blocks changing the email afterwards (which would hijack the "login by nickname").
------------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uname text := new.raw_user_meta_data ->> 'username';
begin
  if uname is null or uname !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'invalid username';
  end if;
  if lower(new.email) is distinct from lower(uname) || '@users.challengegrind.local' then
    raise exception 'email does not match username';
  end if;
  insert into public.profiles (id, username) values (new.id, uname);
  return new;
end $$;

create or replace function public.block_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email
     or (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change)
     or new.phone is distinct from old.phone then
    raise exception 'changing email/phone is not allowed';
  end if;
  return new;
end $$;

drop trigger if exists block_email_change on auth.users;
create trigger block_email_change
  before update on auth.users
  for each row execute function public.block_email_change();

------------------------------------------------------------------------------
-- 4. Record videos: only YouTube or Telegram links (no arbitrary/phishing sites)
------------------------------------------------------------------------------
alter table public.records drop constraint records_video_url_check;
alter table public.records add constraint records_video_url_check check (
  char_length(video_url) <= 300
  and video_url ~ '^https://((www\.|m\.)?youtube\.com|youtu\.be|t\.me|telegram\.me)/'
);
alter table public.records rename constraint records_reject_reason_check to records_review_note_check;

------------------------------------------------------------------------------
-- 5. Privileges
------------------------------------------------------------------------------
revoke execute on function public.block_email_change(), public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.block_email_change() to supabase_auth_admin;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;

-- Supabase grants anon/authenticated full access to every NEW object in public by default.
-- Turn that off so a future table/function is closed unless explicitly granted.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;
