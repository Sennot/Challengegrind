-- ChallengeGrind — notifications for players and an append-only staff action log.
-- Everything is written by triggers / definer functions inside the database, so the site can't fake it.
--   Notifications: record accepted/rejected, level submission accepted/rejected, pack completed, role given.
--   Staff log (List Helper+ can read): reviews, level changes, submissions, packs, roles, bans, rules,
--   password resets (written by the admin-reset-password Edge Function) and record deletions by staff.
--   Changes made directly with SQL are logged with the actor "System".

------------------------------------------------------------------------------
-- Staff log
------------------------------------------------------------------------------
create table public.staff_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text not null,                       -- snapshot; 'System' for direct SQL
  action      text not null check (action in (
    'record_approved', 'record_rejected', 'record_deleted',
    'level_added', 'level_moved', 'level_removed', 'level_edited',
    'submission_approved', 'submission_rejected', 'submission_deleted',
    'pack_created', 'pack_edited', 'pack_deleted',
    'role_changed', 'user_banned', 'user_unbanned', 'password_reset',
    'rules_updated')),
  target_id   uuid references public.profiles (id) on delete set null,
  target_name text,                                -- snapshot of the player's name
  level_id    bigint references public.levels (id) on delete set null,
  level_name  text,                                -- snapshot of the level's name
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index staff_log_created_idx on public.staff_log (created_at desc);
create index staff_log_action_idx on public.staff_log (action, created_at desc);
create index staff_log_actor_idx on public.staff_log (actor_name, created_at desc);

-- Append-only: nobody edits or deletes history. The only allowed update is a foreign key turning
-- null when its level/profile is deleted (names are kept as snapshots).
create or replace function public.staff_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and (new.actor_id is null or new.actor_id = old.actor_id)
     and (new.target_id is null or new.target_id = old.target_id)
     and (new.level_id is null or new.level_id = old.level_id)
     and (new.id, new.actor_name, new.action, new.target_name, new.level_name, new.details, new.created_at)
         is not distinct from (old.id, old.actor_name, old.action, old.target_name, old.level_name, old.details, old.created_at) then
    return new;
  end if;
  raise exception 'the staff log is append-only';
end $$;
create trigger staff_log_immutable before update or delete on public.staff_log
  for each row execute function public.staff_log_immutable();

alter table public.staff_log enable row level security;
create policy "staff read the log" on public.staff_log for select to authenticated using (public.my_rank() >= 1);
revoke all on public.staff_log from anon, authenticated;
grant select on public.staff_log to authenticated;
grant select, insert on public.staff_log to service_role;  -- Edge Function (password resets)

create or replace function public.actor_name(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select username from public.profiles where id = p), 'System')
$$;

create or replace function public.log_action(
  p_action text, p_target uuid, p_level bigint, p_details jsonb default '{}',
  p_target_name text default null, p_level_name text default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.staff_log (actor_id, actor_name, action, target_id, target_name, level_id, level_name, details)
  values (
    (select id from public.profiles where id = auth.uid()),
    public.actor_name(auth.uid()),
    p_action,
    p_target,
    coalesce(p_target_name, (select username from public.profiles where id = p_target)),
    (select id from public.levels where id = p_level),
    coalesce(p_level_name, (select name from public.levels where id = p_level)),
    coalesce(jsonb_strip_nulls(p_details), '{}')
  )
$$;

------------------------------------------------------------------------------
-- Notifications
------------------------------------------------------------------------------
create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('record_approved', 'record_rejected', 'level_approved', 'level_rejected', 'pack_completed', 'role_changed')),
  title      text not null check (char_length(title) <= 200),
  body       text check (char_length(body) <= 700),
  link       text check (link ~ '^/[A-Za-z0-9/_.-]*$'),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- Internal: add a notification (older than 90 days are cleaned up on the way)
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, link)
    values (p_user, p_kind, p_title, left(p_body, 700), p_link);
  delete from public.notifications where user_id = p_user and created_at < now() - interval '90 days';
end $$;

create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

------------------------------------------------------------------------------
-- Pack completed: notify once per pack and player, the first time they hold every level
------------------------------------------------------------------------------
create table public.pack_completion_notified (
  pack_id    bigint not null references public.packs (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pack_id, user_id)
);
alter table public.pack_completion_notified enable row level security;  -- no policies: internal only
revoke all on public.pack_completion_notified from anon, authenticated;

-- Registered, not banned players who have every level of a pack (accepted record or verification)
create or replace function public.pack_completions(p_pack bigint default null, p_user uuid default null)
returns table (pack_id bigint, user_id uuid, pack_name text, bonus numeric)
language sql stable security definer set search_path = '' as $$
  with sizes as (
    select pl.pack_id, count(*) as n from public.pack_levels pl
     where p_pack is null or pl.pack_id = p_pack group by pl.pack_id
  ), done as (
    select r.player_id as user_id, r.level_id from public.records r
     where r.status = 'approved' and (p_user is null or r.player_id = p_user)
    union
    select l.verifier_id, l.id from public.levels l
     where l.verifier_id is not null and (p_user is null or l.verifier_id = p_user)
  )
  select pl.pack_id, d.user_id, pk.name, pk.bonus_points
    from done d
    join public.pack_levels pl on pl.level_id = d.level_id
    join sizes s on s.pack_id = pl.pack_id
    join public.packs pk on pk.id = pl.pack_id
    join public.profiles p on p.id = d.user_id and not p.banned
   group by pl.pack_id, d.user_id, pk.name, pk.bonus_points, s.n
  having count(distinct d.level_id) = s.n
$$;

create or replace function public.notify_pack_completions(p_pack bigint default null, p_user uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  for c in
    select * from public.pack_completions(p_pack, p_user) x
     where not exists (select 1 from public.pack_completion_notified n where n.pack_id = x.pack_id and n.user_id = x.user_id)
  loop
    insert into public.pack_completion_notified (pack_id, user_id) values (c.pack_id, c.user_id) on conflict do nothing;
    perform public.notify(c.user_id, 'pack_completed', 'Pack completed',
      format('You completed the pack %s', c.pack_name)
        || case when c.bonus > 0 then format(': +%s bonus points', trim_scale(c.bonus)) else '' end,
      '/packs');
  end loop;
end $$;

-- Packs completed before this migration count as already announced (no burst of old news)
insert into public.pack_completion_notified (pack_id, user_id)
  select pack_id, user_id from public.pack_completions() on conflict do nothing;

------------------------------------------------------------------------------
-- Triggers: records
------------------------------------------------------------------------------
create or replace function public.records_after_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lname text;
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    select name into lname from public.levels where id = new.level_id;
    if new.status = 'approved' then
      perform public.notify(new.player_id, 'record_approved', 'Your record was accepted',
        format('Your record on %s was accepted!', lname), '/level/' || new.level_id);
    else
      perform public.notify(new.player_id, 'record_rejected', 'Your record was rejected',
        format('Your record on %s was rejected', lname) || coalesce(': ' || new.review_note, '.'), '/level/' || new.level_id);
    end if;
    perform public.log_action(
      case when new.status = 'approved' then 'record_approved' else 'record_rejected' end,
      new.player_id, new.level_id, jsonb_build_object('note', new.review_note, 'video', new.video_url));
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    perform public.notify_pack_completions(null, new.player_id);
  end if;
  return null;
end $$;
create trigger records_after_status after update of status on public.records
  for each row execute function public.records_after_status();

-- Staff (or SQL) removing someone's record; a player withdrawing their own is not logged.
-- Records deleted together with their level or account are skipped (the level/profile is already gone).
create or replace function public.records_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is distinct from old.player_id
     and exists (select 1 from public.levels where id = old.level_id)
     and exists (select 1 from public.profiles where id = old.player_id) then
    perform public.log_action('record_deleted', old.player_id, old.level_id,
      jsonb_build_object('status', old.status, 'video', old.video_url));
  end if;
  return null;
end $$;
create trigger records_after_delete after delete on public.records
  for each row execute function public.records_after_delete();

------------------------------------------------------------------------------
-- Triggers: levels
------------------------------------------------------------------------------
-- add / move / remove already go through the changelog
create or replace function public.changelog_to_staff_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_action('level_' || new.kind::text, null, new.level_id,
    jsonb_build_object('from', new.old_position, 'to', new.new_position), null, new.level_name);
  return null;
end $$;
create trigger changelog_to_staff_log after insert on public.changelog
  for each row execute function public.changelog_to_staff_log();

create or replace function public.levels_after_edit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changes jsonb := '{}';
begin
  if new.name      is distinct from old.name      then changes := changes || jsonb_build_object('name',     jsonb_build_array(old.name, new.name)); end if;
  if new.creator   is distinct from old.creator   then changes := changes || jsonb_build_object('creator',  jsonb_build_array(old.creator, new.creator)); end if;
  if new.verifier  is distinct from old.verifier  then changes := changes || jsonb_build_object('verifier', jsonb_build_array(old.verifier, new.verifier)); end if;
  if new.gd_id     is distinct from old.gd_id     then changes := changes || jsonb_build_object('level id', jsonb_build_array(old.gd_id, new.gd_id)); end if;
  if new.video_url is distinct from old.video_url then changes := changes || jsonb_build_object('video',    jsonb_build_array(old.video_url, new.video_url)); end if;
  if new.fps       is distinct from old.fps       then changes := changes || jsonb_build_object('fps',      jsonb_build_array(old.fps, new.fps)); end if;
  if changes <> '{}' then
    perform public.log_action('level_edited', null, new.id, jsonb_build_object('changes', changes));
  end if;
  return null;
end $$;
create trigger levels_after_edit after update on public.levels
  for each row execute function public.levels_after_edit();

-- A verification linked to an account can complete a pack
create or replace function public.levels_after_verifier() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.verifier_id is not null and (tg_op = 'INSERT' or new.verifier_id is distinct from old.verifier_id) then
    perform public.notify_pack_completions(null, new.verifier_id);
  end if;
  return null;
end $$;
create trigger levels_after_verifier after insert or update of verifier_id on public.levels
  for each row execute function public.levels_after_verifier();

------------------------------------------------------------------------------
-- Triggers: level submissions
------------------------------------------------------------------------------
create or replace function public.level_submissions_after_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  pos int;
begin
  if old.status = 'pending' and new.status = 'approved' then
    select position into pos from public.levels where id = new.level_id;
    perform public.notify(new.submitter_id, 'level_approved', 'Your level was added',
      format('Your level %s was added to the list', new.name) || coalesce(format(' at #%s', pos), '') || '!',
      case when new.level_id is not null then '/level/' || new.level_id end);
    perform public.log_action('submission_approved', new.submitter_id, new.level_id,
      jsonb_build_object('name', new.name, 'position', pos, 'note', new.review_note));
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform public.notify(new.submitter_id, 'level_rejected', 'Your level was rejected',
      format('Your level %s was rejected', new.name) || coalesce(': ' || new.review_note, '.'), '/submit-level');
    perform public.log_action('submission_rejected', new.submitter_id, null,
      jsonb_build_object('name', new.name, 'note', new.review_note));
  end if;
  return null;
end $$;
create trigger level_submissions_after_status after update of status on public.level_submissions
  for each row execute function public.level_submissions_after_status();

create or replace function public.level_submissions_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is distinct from old.submitter_id and exists (select 1 from public.profiles where id = old.submitter_id) then
    perform public.log_action('submission_deleted', old.submitter_id, null,
      jsonb_build_object('name', old.name, 'status', old.status));
  end if;
  return null;
end $$;
create trigger level_submissions_after_delete after delete on public.level_submissions
  for each row execute function public.level_submissions_after_delete();

------------------------------------------------------------------------------
-- Triggers: roles & bans
------------------------------------------------------------------------------
create or replace function public.role_label(r public.app_role) returns text
language sql immutable set search_path = '' as $$
  select case r when 'player' then 'Player' when 'helper' then 'List Helper' when 'moderator' then 'List Moderator'
                when 'admin' then 'List Admin' when 'owner' then 'Owner' end
$$;

create or replace function public.profiles_after_staff_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role then
    perform public.log_action('role_changed', new.id, null,
      jsonb_build_object('from', public.role_label(old.role), 'to', public.role_label(new.role)));
    if new.role <> 'player' then
      perform public.notify(new.id, 'role_changed', 'New role',
        format('You were given the %s role', public.role_label(new.role)), '/player/' || new.username);
    end if;
  end if;
  if new.banned is distinct from old.banned then
    perform public.log_action(case when new.banned then 'user_banned' else 'user_unbanned' end, new.id, null,
      jsonb_build_object('reason', new.ban_reason));
  end if;
  return null;
end $$;
create trigger profiles_after_staff_change after update of role, banned on public.profiles
  for each row execute function public.profiles_after_staff_change();

------------------------------------------------------------------------------
-- Rules
------------------------------------------------------------------------------
create or replace function public.site_settings_after_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.key = 'rules' then
    perform public.log_action('rules_updated', null, null, jsonb_build_object('sections', jsonb_array_length(new.value)));
  end if;
  return null;
end $$;
create trigger site_settings_after_change after insert or update on public.site_settings
  for each row execute function public.site_settings_after_change();

------------------------------------------------------------------------------
-- Packs: log in the functions (they know the level list), announce completions after level changes
------------------------------------------------------------------------------
create or replace function public.save_pack(p_id bigint, p_name text, p_color text, p_level_ids bigint[], p_bonus numeric default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint := p_id;
  n int := coalesce(cardinality(p_level_ids), 0);
  old_name text;
  old_bonus numeric;
  old_n int;
begin
  perform public.require_rank(2);
  if n < 1 or n > 100 then raise exception 'a pack needs 1 to 100 levels'; end if;
  if exists (select 1 from unnest(p_level_ids) x where not exists (select 1 from public.levels l where l.id = x)) then
    raise exception 'unknown level in pack';
  end if;

  if v_id is null then
    insert into public.packs (name, color, bonus_points)
      values (trim(p_name), lower(trim(p_color)), coalesce(p_bonus, 0))
      returning id into v_id;
  else
    select name, bonus_points into old_name, old_bonus from public.packs where id = v_id for update;
    if not found then raise exception 'pack not found'; end if;
    select count(*) into old_n from public.pack_levels where pack_id = v_id;
    update public.packs set
      name = trim(p_name), color = lower(trim(p_color)), bonus_points = coalesce(p_bonus, bonus_points), updated_at = now()
    where id = v_id;
    delete from public.pack_levels where pack_id = v_id;
  end if;

  insert into public.pack_levels (pack_id, level_id)
    select distinct v_id, x from unnest(p_level_ids) x;

  if p_id is null then
    perform public.log_action('pack_created', null, null,
      jsonb_build_object('pack', trim(p_name), 'levels', (select count(*) from public.pack_levels where pack_id = v_id), 'bonus', coalesce(p_bonus, 0)));
  else
    perform public.log_action('pack_edited', null, null, jsonb_build_object(
      'pack', trim(p_name),
      'renamed_from', case when old_name is distinct from trim(p_name) then old_name end,
      'levels', jsonb_build_array(old_n, (select count(*) from public.pack_levels where pack_id = v_id)),
      'bonus', case when p_bonus is not null and p_bonus <> old_bonus then jsonb_build_array(old_bonus, p_bonus) end));
  end if;

  perform public.notify_pack_completions(v_id, null);
  return v_id;
end $$;

create or replace function public.delete_pack(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pname text;
begin
  perform public.require_rank(2);
  delete from public.packs where id = p_id returning name into pname;
  if not found then raise exception 'pack not found'; end if;
  perform public.log_action('pack_deleted', null, null, jsonb_build_object('pack', pname));
end $$;

-- A level leaving the list (or a pack) can complete a pack for players who had all the others
create or replace function public.pack_levels_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p bigint;
begin
  for p in select distinct o.pack_id from old_rows o where exists (select 1 from public.packs where id = o.pack_id) loop
    perform public.notify_pack_completions(p, null);
  end loop;
  return null;
end $$;
create trigger pack_levels_after_delete after delete on public.pack_levels
  referencing old table as old_rows
  for each statement execute function public.pack_levels_after_delete();

------------------------------------------------------------------------------
-- Function privileges (internal helpers closed; only the read-marker is callable)
------------------------------------------------------------------------------
revoke execute on function
  public.staff_log_immutable(),
  public.actor_name(uuid),
  public.log_action(text, uuid, bigint, jsonb, text, text),
  public.notify(uuid, text, text, text, text),
  public.mark_notifications_read(),
  public.pack_completions(bigint, uuid),
  public.notify_pack_completions(bigint, uuid),
  public.records_after_status(),
  public.records_after_delete(),
  public.changelog_to_staff_log(),
  public.levels_after_edit(),
  public.levels_after_verifier(),
  public.level_submissions_after_status(),
  public.level_submissions_after_delete(),
  public.role_label(public.app_role),
  public.profiles_after_staff_change(),
  public.site_settings_after_change(),
  public.pack_levels_after_delete()
  from public, anon, authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
