-- ChallengeGrind — submit records and levels from the bot's DM (/submit, /submitlevel).
-- The bot (service_role) calls these on behalf of the linked account. They run the same insert as the
-- site, so every rule still applies: banned check, pending limits, one active record per level,
-- YouTube/Telegram-only videos, "level already on the list". Notifications/staff chat/log work as usual.

alter table public.telegram_state drop constraint telegram_state_step_check;
alter table public.telegram_state add constraint telegram_state_step_check check (step in (
  'login_username', 'login_password', 'reject_record', 'reject_submission', 'submit_record', 'submit_level'));

create or replace function public.tg_submit_record(p_user uuid, p_level bigint, p_video text, p_note text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  new_id bigint;
begin
  if not exists (select 1 from public.profiles where id = p_user and not banned) then
    raise exception 'account is banned';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  insert into public.records (level_id, player_id, video_url, note)
    values (p_level, p_user, trim(p_video), nullif(trim(p_note), ''))
    returning id into new_id;
  return new_id;
end $$;

create or replace function public.tg_submit_level(
  p_user uuid, p_gd_id bigint, p_fps text, p_name text, p_creator text, p_publisher text,
  p_verifier text, p_video text, p_placement text, p_telegram text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  new_id bigint;
begin
  if not exists (select 1 from public.profiles where id = p_user and not banned) then
    raise exception 'account is banned';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  insert into public.level_submissions (submitter_id, gd_id, fps, name, creator, publisher, verifier, video_url, placement, telegram)
    values (p_user, p_gd_id, p_fps, p_name, p_creator, p_publisher, p_verifier, trim(p_video), p_placement, p_telegram)
    returning id into new_id;
  return new_id;
end $$;

revoke execute on function
  public.tg_submit_record(uuid, bigint, text, text),
  public.tg_submit_level(uuid, bigint, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.tg_submit_record(uuid, bigint, text, text),
  public.tg_submit_level(uuid, bigint, text, text, text, text, text, text, text, text)
  to service_role;
