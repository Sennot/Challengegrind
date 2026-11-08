-- ChallengeGrind — which events the database sends to the Telegram bot is now a setting.
-- telegram_config.allowed_events: comma-separated event types; when the key is missing, every event is sent.
-- Replaces the fixed "staff_only" switch from 0021. Now: staff chat + changelog posts.
--   all events:    delete from public.telegram_config where key = 'allowed_events';
-- Event types: notification, changelog, pack_created, record_pending, record_reviewed, submission_pending, submission_reviewed

create or replace function public.tg_emit(p_type text, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select value from public.telegram_config where key = 'function_url');
  v_secret text := (select value from public.telegram_config where key = 'internal_secret');
  v_allowed text := (select value from public.telegram_config where key = 'allowed_events');
begin
  if v_url is null or v_secret is null then return; end if;  -- bot not configured / turned off
  if v_allowed is not null and not (p_type = any (string_to_array(replace(v_allowed, ' ', ''), ','))) then
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

delete from public.telegram_config where key = 'staff_only';
insert into public.telegram_config (key, value)
  values ('allowed_events', 'record_pending,record_reviewed,submission_pending,submission_reviewed,changelog')
  on conflict (key) do update set value = excluded.value;
