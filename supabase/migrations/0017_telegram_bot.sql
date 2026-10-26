-- ChallengeGrind — Telegram bot (@challengegrind_bot), served by the Edge Function "telegram-bot".
-- The database pushes events to the function with pg_net; the function talks to Telegram.
-- All bot tables are internal: RLS on, no policies, only service_role (the Edge Function) can use them.

create extension if not exists pg_net;

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------
-- function_url, internal_secret, group_chat_id, changelog_thread_id, staff_chat_id, staff_thread_id
create table public.telegram_config (
  key   text primary key,
  value text not null
);

-- A site account linked to a Telegram account (/login in the bot's DM)
create table public.telegram_links (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  tg_user_id  bigint not null unique,
  tg_username text,
  notify      boolean not null default true,
  linked_at   timestamptz not null default now()
);

-- Multi-step conversations: login (nickname → password), staff typing a reject reason
create table public.telegram_state (
  tg_user_id bigint primary key,
  step       text not null check (step in ('login_username', 'login_password', 'reject_record', 'reject_submission')),
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Rate limits: login attempts, command cooldown per chat
create table public.telegram_rate (
  key text not null,
  at  timestamptz not null default now()
);
create index telegram_rate_key_idx on public.telegram_rate (key, at desc);

-- Staff chat messages with Accept/Reject buttons, updated once the item is reviewed
create table public.telegram_staff_messages (
  kind       text not null check (kind in ('record', 'submission')),
  item_id    bigint not null,
  chat_id    bigint not null,
  message_id bigint not null,
  primary key (kind, item_id)
);

do $$
declare t text;
begin
  foreach t in array array['telegram_config', 'telegram_links', 'telegram_state', 'telegram_rate', 'telegram_staff_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

------------------------------------------------------------------------------
-- Bot-only functions (service_role)
------------------------------------------------------------------------------
-- /login: check a nickname + password against the account's bcrypt hash (works with captcha on the site)
create or replace function public.tg_check_password(p_username text, p_password text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id
    from auth.users u
    join public.profiles p on p.id = u.id
   where lower(p.username) = lower(trim(p_username))
     and not p.banned
     and u.encrypted_password is not null and u.encrypted_password <> ''
     and u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
$$;

-- Staff buttons in Telegram act as the linked account: same permission checks and log entry as on the site
create or replace function public.tg_review_record(p_actor uuid, p_record_id bigint, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  st public.record_status;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  select status into st from public.records where id = p_record_id for update;
  if not found then raise exception 'record not found'; end if;
  if st <> 'pending' then raise exception 'already reviewed'; end if;
  perform public.review_record(p_record_id, p_approve, p_note);
end $$;

create or replace function public.tg_reject_submission(p_actor uuid, p_id bigint, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  perform public.reject_level_submission(p_id, p_note);
end $$;

------------------------------------------------------------------------------
-- Events: database → Edge Function
------------------------------------------------------------------------------
create or replace function public.tg_emit(p_type text, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select value from public.telegram_config where key = 'function_url');
  v_secret text := (select value from public.telegram_config where key = 'internal_secret');
begin
  if v_url is null or v_secret is null then return; end if;  -- bot not configured yet
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('type', p_type, 'id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    timeout_milliseconds := 10000
  );
end $$;

-- site notifications → DM (only for linked players who want them)
create or replace function public.tg_on_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.telegram_links where user_id = new.user_id and notify) then
    perform public.tg_emit('notification', new.id);
  end if;
  return null;
end $$;
create trigger tg_on_notification after insert on public.notifications
  for each row execute function public.tg_on_notification();

-- changelog → group topic
create or replace function public.tg_on_changelog() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.tg_emit('changelog', new.id);
  return null;
end $$;
create trigger tg_on_changelog after insert on public.changelog
  for each row execute function public.tg_on_changelog();

-- new pack → group topic
create or replace function public.tg_on_staff_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.action = 'pack_created' then perform public.tg_emit('pack_created', new.id); end if;
  return null;
end $$;
create trigger tg_on_staff_log after insert on public.staff_log
  for each row execute function public.tg_on_staff_log();

-- new / reviewed records → staff chat
create or replace function public.tg_on_record() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.tg_emit('record_pending', new.id);
  elsif old.status = 'pending' and new.status <> 'pending'
        and exists (select 1 from public.telegram_staff_messages where kind = 'record' and item_id = new.id) then
    perform public.tg_emit('record_reviewed', new.id);
  end if;
  return null;
end $$;
create trigger tg_on_record after insert or update of status on public.records
  for each row execute function public.tg_on_record();

-- new / reviewed level submissions → staff chat
create or replace function public.tg_on_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.tg_emit('submission_pending', new.id);
  elsif old.status = 'pending' and new.status <> 'pending'
        and exists (select 1 from public.telegram_staff_messages where kind = 'submission' and item_id = new.id) then
    perform public.tg_emit('submission_reviewed', new.id);
  end if;
  return null;
end $$;
create trigger tg_on_submission after insert or update of status on public.level_submissions
  for each row execute function public.tg_on_submission();

-- A banned player's Telegram link is removed
create or replace function public.tg_on_ban() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.banned and not old.banned then
    delete from public.telegram_state where tg_user_id in (select tg_user_id from public.telegram_links where user_id = new.id);
    delete from public.telegram_links where user_id = new.id;
  end if;
  return null;
end $$;
create trigger tg_on_ban after update of banned on public.profiles
  for each row execute function public.tg_on_ban();

------------------------------------------------------------------------------
-- Privileges
------------------------------------------------------------------------------
revoke execute on function
  public.tg_check_password(text, text),
  public.tg_review_record(uuid, bigint, boolean, text),
  public.tg_reject_submission(uuid, bigint, text),
  public.tg_emit(text, bigint),
  public.tg_on_notification(),
  public.tg_on_changelog(),
  public.tg_on_staff_log(),
  public.tg_on_record(),
  public.tg_on_submission(),
  public.tg_on_ban()
  from public, anon, authenticated;
grant execute on function
  public.tg_check_password(text, text),
  public.tg_review_record(uuid, bigint, boolean, text),
  public.tg_reject_submission(uuid, bigint, text)
  to service_role;
