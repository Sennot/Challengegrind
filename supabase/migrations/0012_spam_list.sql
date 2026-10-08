-- ChallengeGrind — Spam Challenge List (SCL) next to the Challenge List (CL).
-- Each list has its own positions, changelog, leaderboard, rules and level submissions.
-- Accounts, roles and bans are shared. SCL levels/records/submissions carry FPS + click method.

create type public.list_kind as enum ('cl', 'scl');

------------------------------------------------------------------------------
-- Levels: list + method, positions unique per list
------------------------------------------------------------------------------
alter table public.levels
  add column list   public.list_kind not null default 'cl',
  add column method text check (char_length(method) between 1 and 40);

alter table public.levels drop constraint levels_position_unique;
alter table public.levels add constraint levels_position_unique unique (list, position) deferrable initially deferred;

grant update (method) on public.levels to authenticated;

alter table public.changelog add column list public.list_kind not null default 'cl';
create index changelog_list_created_idx on public.changelog (list, created_at desc);

drop function public.add_level(text, text, text, bigint, text, int, text);
create function public.add_level(
  p_name text, p_creator text, p_verifier text, p_gd_id bigint, p_video_url text, p_position int,
  p_fps text default null, p_list public.list_kind default 'cl', p_method text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  total int; new_id bigint; prev_n text; next_n text;
begin
  perform public.require_rank(2);
  perform pg_advisory_xact_lock(hashtext('challengegrind.levels'));

  select count(*) into total from public.levels where list = p_list;
  if p_position is null or p_position < 1 or p_position > total + 1 then
    raise exception 'position must be between 1 and %', total + 1;
  end if;

  update public.levels set position = position + 1 where list = p_list and position >= p_position;
  insert into public.levels (name, creator, verifier, gd_id, video_url, position, fps, list, method)
    values (trim(p_name), trim(p_creator), trim(p_verifier), p_gd_id, nullif(trim(p_video_url), ''), p_position,
            nullif(trim(p_fps), ''), p_list, nullif(trim(p_method), ''))
    returning id into new_id;

  select name into prev_n from public.levels where list = p_list and position = p_position - 1;
  select name into next_n from public.levels where list = p_list and position = p_position + 1;
  insert into public.changelog (kind, level_id, level_name, new_position, prev_name, next_name, actor, list)
    values ('added', new_id, trim(p_name), p_position, prev_n, next_n, auth.uid(), p_list);
  return new_id;
end $$;

create or replace function public.move_level(p_level_id bigint, p_new_position int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  total int; old_pos int; lname text; prev_n text; next_n text; l_list public.list_kind;
begin
  perform public.require_rank(2);
  perform pg_advisory_xact_lock(hashtext('challengegrind.levels'));

  select position, name, list into old_pos, lname, l_list from public.levels where id = p_level_id;
  if not found then raise exception 'level not found'; end if;
  select count(*) into total from public.levels where list = l_list;
  if p_new_position is null or p_new_position < 1 or p_new_position > total then
    raise exception 'position must be between 1 and %', total;
  end if;
  if p_new_position = old_pos then return; end if;

  if p_new_position < old_pos then
    update public.levels set position = position + 1
      where list = l_list and position >= p_new_position and position < old_pos;
  else
    update public.levels set position = position - 1
      where list = l_list and position > old_pos and position <= p_new_position;
  end if;
  update public.levels set position = p_new_position where id = p_level_id;

  select name into prev_n from public.levels where list = l_list and position = p_new_position - 1;
  select name into next_n from public.levels where list = l_list and position = p_new_position + 1;
  insert into public.changelog (kind, level_id, level_name, old_position, new_position, prev_name, next_name, actor, list)
    values ('moved', p_level_id, lname, old_pos, p_new_position, prev_n, next_n, auth.uid(), l_list);
end $$;

create or replace function public.remove_level(p_level_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  old_pos int; lname text; l_list public.list_kind;
begin
  perform public.require_rank(2);
  perform pg_advisory_xact_lock(hashtext('challengegrind.levels'));

  select position, name, list into old_pos, lname, l_list from public.levels where id = p_level_id;
  if not found then raise exception 'level not found'; end if;

  delete from public.levels where id = p_level_id;
  update public.levels set position = position - 1 where list = l_list and position > old_pos;
  insert into public.changelog (kind, level_name, old_position, actor, list)
    values ('removed', lname, old_pos, auth.uid(), l_list);
end $$;

------------------------------------------------------------------------------
-- Records: FPS + method (required on SCL levels)
------------------------------------------------------------------------------
alter table public.records
  add column fps    text check (fps ~ '^[A-Za-z0-9 /+.-]{1,20}$'),
  add column method text check (char_length(method) between 1 and 40);

grant insert (fps, method) on public.records to authenticated;

create or replace function public.records_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.status := 'pending';
  new.reviewer_id := null;
  new.reviewed_at := null;
  new.review_note := null;
  new.created_at := now();
  new.fps := nullif(trim(new.fps), '');
  new.method := nullif(trim(new.method), '');
  if (select list from public.levels where id = new.level_id) = 'scl'
     and (new.fps is null or new.method is null) then
    raise exception 'FPS and method are required for spam challenges';
  end if;
  if (select count(*) from public.records where player_id = new.player_id and status = 'pending') >= 5 then
    raise exception 'too many pending records (max 5)';
  end if;
  return new;
end $$;

------------------------------------------------------------------------------
-- Level submissions: list + method
------------------------------------------------------------------------------
alter table public.level_submissions
  add column list   public.list_kind not null default 'cl',
  add column method text check (char_length(method) between 1 and 40),
  add constraint level_submissions_scl_method_check check (list = 'cl' or method is not null);

drop index public.level_submissions_one_pending_idx;
create unique index level_submissions_one_pending_idx on public.level_submissions (submitter_id, list, gd_id) where status = 'pending';

grant insert (list, method) on public.level_submissions to authenticated;

create or replace function public.level_submissions_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.status := 'pending';
  new.reviewer_id := null;
  new.reviewed_at := null;
  new.review_note := null;
  new.level_id := null;
  new.created_at := now();
  new.name := trim(new.name);
  new.creator := trim(new.creator);
  new.publisher := trim(new.publisher);
  new.verifier := trim(new.verifier);
  new.fps := trim(new.fps);
  new.method := nullif(trim(new.method), '');
  new.placement := trim(new.placement);
  if exists (select 1 from public.levels where gd_id = new.gd_id and list = new.list) then
    raise exception 'level already on the list';
  end if;
  if (select count(*) from public.level_submissions where submitter_id = new.submitter_id and status = 'pending') >= 3 then
    raise exception 'too many pending level submissions (max 3)';
  end if;
  return new;
end $$;

drop function public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text);
create function public.accept_level_submission(
  p_id bigint, p_name text, p_creator text, p_verifier text, p_gd_id bigint, p_video_url text, p_fps text,
  p_position int, p_note text default null, p_method text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  new_level bigint; s_list public.list_kind;
begin
  perform public.require_rank(2);
  select list into s_list from public.level_submissions where id = p_id and status = 'pending' for update;
  if not found then raise exception 'submission not found or already reviewed'; end if;

  new_level := public.add_level(p_name, p_creator, p_verifier, p_gd_id, p_video_url, p_position, p_fps, s_list, p_method);
  update public.level_submissions set
    status      = 'approved',
    reviewer_id = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(trim(p_note), ''),
    level_id    = new_level
  where id = p_id;
  return new_level;
end $$;

------------------------------------------------------------------------------
-- Leaderboard: one ranking per list
------------------------------------------------------------------------------
drop view public.leaderboard;
create view public.leaderboard with (security_invoker = true) as
with done as (
  select r.player_id, r.level_id, false as verified from public.records r where r.status = 'approved'
  union
  select l.verifier_id, l.id, true from public.levels l where l.verifier_id is not null
), per_level as (
  -- a verifier who also submitted a record counts once
  select player_id, level_id, bool_or(verified) as verified from done group by player_id, level_id
), entries as (
  select p.id, p.username, p.country, true as registered, l.list, l.position, l.name, d.verified
    from per_level d
    join public.profiles p on p.id = d.player_id and not p.banned
    join public.levels l on l.id = d.level_id
  union all
  select null::uuid, trim(l.verifier), null::text, false, l.list, l.position, l.name, true
    from public.levels l
   where l.verifier_id is null
)
select
  id,
  username,
  country,
  sum(public.level_points(position))                                  as points,
  count(*)::int                                                       as completions,
  min(position)                                                       as hardest_position,
  (array_agg(name order by position))[1]                              as hardest_name,
  rank() over (partition by list order by sum(public.level_points(position)) desc)::int as rank,
  count(*) filter (where verified)::int                               as verifications,
  registered,
  list
from entries
group by id, username, country, registered, list;

revoke all on public.leaderboard from anon, authenticated;
grant select on public.leaderboard to anon, authenticated;

------------------------------------------------------------------------------
-- Rules per list: site_settings keys 'rules' (CL) and 'rules_scl' (SCL)
------------------------------------------------------------------------------
alter table public.site_settings drop constraint site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check check (key in ('rules', 'rules_scl'));

drop function public.set_rules(jsonb);
create function public.set_rules(p_rules jsonb, p_list public.list_kind default 'cl') returns void
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb;
  k text := case when p_list = 'scl' then 'rules_scl' else 'rules' end;
begin
  perform public.require_rank(3);
  if jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) > 30 then
    raise exception 'rules must be an array of at most 30 sections';
  end if;
  for s in select * from jsonb_array_elements(p_rules) loop
    if jsonb_typeof(s -> 'title') <> 'string' or char_length(s ->> 'title') not between 1 and 120
       or jsonb_typeof(s -> 'items') <> 'array' or jsonb_array_length(s -> 'items') > 40
       or exists (select 1 from jsonb_array_elements(s -> 'items') i
                  where jsonb_typeof(i) <> 'string' or char_length(i #>> '{}') not between 1 and 600) then
      raise exception 'invalid rules section';
    end if;
  end loop;

  insert into public.site_settings (key, value, updated_by, updated_at)
  values (k, p_rules, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

------------------------------------------------------------------------------
-- Function privileges
------------------------------------------------------------------------------
revoke execute on function
  public.add_level(text, text, text, bigint, text, int, text, public.list_kind, text),
  public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text, text),
  public.set_rules(jsonb, public.list_kind)
  from public, anon, authenticated;
grant execute on function
  public.add_level(text, text, text, bigint, text, int, text, public.list_kind, text),
  public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text, text),
  public.set_rules(jsonb, public.list_kind)
  to authenticated;
