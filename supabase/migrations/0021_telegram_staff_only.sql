-- ChallengeGrind — Telegram bot "staff only" mode.
-- With telegram_config.staff_only = 'true' the database only sends the bot the events of the staff chat
-- (records / level submissions to review and their status updates). DM notifications, changelog posts
-- and new-pack posts are not sent. Delete the key (or set it to anything else) to turn everything back on.
-- Incoming updates are filtered by the /tg-hook Pages Function (functions/tg-hook.ts).

create or replace function public.tg_emit(p_type text, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select value from public.telegram_config where key = 'function_url');
  v_secret text := (select value from public.telegram_config where key = 'internal_secret');
  v_staff_only boolean := exists (select 1 from public.telegram_config where key = 'staff_only' and value = 'true');
begin
  if v_url is null or v_secret is null then return; end if;  -- bot not configured / turned off
  if v_staff_only and p_type not in ('record_pending', 'record_reviewed', 'submission_pending', 'submission_reviewed') then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('type', p_type, 'id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    timeout_milliseconds := 10000
  );
end $$;

revoke execute on function public.tg_emit(text, bigint) from public, anon, authenticated;

insert into public.telegram_config (key, value) values ('staff_only', 'true')
  on conflict (key) do update set value = excluded.value;
