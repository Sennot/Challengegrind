-- ChallengeGrind — remove the Spam Challenge List (0012) and add level packs.
-- SCL had no data when this ran; everything returns to a single list.
-- Packs: List Moderator+ create/edit/delete packs (name, color, levels); bonus points are set by List Admin+.
-- A player who has every level of a pack (accepted record or verification) gets its bonus in the leaderboard.
-- Packs are live: adding a level to a pack takes the bonus away until the player beats that level too.

drop view public.leaderboard;

------------------------------------------------------------------------------
-- 1. Remove SCL
------------------------------------------------------------------------------
-- Levels: back to one list with globally unique positions
drop function public.add_level(text, text, text, bigint, text, int, text, public.list_kind, text);
create function public.add_level(
  p_name text, p_creator text, p_verifier text, p_gd_id bigint, p_video_url text, p_position int, p_fps text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  total int; new_id bigint; prev_n text; next_n text;
begin
  perform public.require_rank(2);
  perform pg_advisory_xact_lock(hashtext('challengegrind.levels'));

  select count(*) into total from public.levels;
  if p_position is null or p_position < 1 or p_position > total + 1 then
    raise exception 'position must be between 1 and %', total + 1;
  end if;

  update public.levels set position = position + 1 where position >= p_position;
  insert into public.levels (name, creator, verifier, gd_id, video_url, position, fps)
    values (trim(p_name), trim(p_creator), trim(p_verifier), p_gd_id, nullif(trim(p_video_url), ''), p_position, nullif(trim(p_fps), ''))
    returning id into new_id;

  select name into prev_n from public.levels where position = p_position - 1;
  select name into next_n from public.levels where position = p_position + 1;
  insert into public.changelog (kind, level_id, level_name, new_position, prev_name, next_name, actor)
    values ('added', new_id, trim(p_name), p_position, prev_n, next_n, auth.uid());
  return new_id;
end $$;

create or replace function public.move_level(p_level_id bigint, p_new_position int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  total int; old_pos int; lname text; prev_n text; next_n text;
begin
  perform public.require_rank(2);
  perform pg_advisory_xact_lock(hashtext('challengegrind.levels'));

  select position, name into old_pos, lname from public.levels where id = p_level_id;
  if not found then raise exception 'level not found'; end if;
  select count(*) into total from public.levels;
  if p_new_position is null or p_new_position < 1 or p_new_position > total then
    raise exception 'position must be between 1 and %', total;
  end if;
  if p_new_position = old_pos then return; end if;

  if p_new_position < old_pos then
    update public.levels set position = position + 1
      where position >= p_new_position and position < old_pos;
  else
    update public.levels set position = position - 1
      where position > old_pos and position <= p_new_position;
  end if;
  update public.levels set position = p_new_position where id = p_level_id;

  select name into prev_n from public.levels where position = p_new_position - 1;
  select name into next_n from public.levels where position = p_new_position + 1;
  insert into public.changelog (kind, level_id, level_name, old_position, new_position, prev_name, next_name, actor)
    values ('moved', p_level_id, lname, old_pos, p_new_position, prev_n, next_n, auth.uid());
end $$;

create or replace function public.remove_level(p_level_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  old_pos int; lname text;
begin
  perform public.require_rank(2);
  perform pg_advisory_xact_lock(hashtext('challengegrind.levels'));

  select position, name into old_pos, lname from public.levels where id = p_level_id;
  if not found then raise exception 'level not found'; end if;

  delete from public.levels where id = p_level_id;
  update public.levels set position = position - 1 where position > old_pos;
  insert into public.changelog (kind, level_name, old_position, actor)
    values ('removed', lname, old_pos, auth.uid());
end $$;

alter table public.levels drop constraint levels_position_unique;
alter table public.levels add constraint levels_position_unique unique (position) deferrable initially deferred;
alter table public.levels drop column list, drop column method;

alter table public.changelog drop column list;  -- drops changelog_list_created_idx too

-- Records: no FPS / method
create or replace function public.records_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.status := 'pending';
  new.reviewer_id := null;
  new.reviewed_at := null;
  new.review_note := null;
  new.created_at := now();
  if (select count(*) from public.records where player_id = new.player_id and status = 'pending') >= 5 then
    raise exception 'too many pending records (max 5)';
  end if;
  return new;
end $$;

alter table public.records drop column fps, drop column method;

-- Level submissions: no list / method
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
  new.placement := trim(new.placement);
  if exists (select 1 from public.levels where gd_id = new.gd_id) then
    raise exception 'level already on the list';
  end if;
  if (select count(*) from public.level_submissions where submitter_id = new.submitter_id and status = 'pending') >= 3 then
    raise exception 'too many pending level submissions (max 3)';
  end if;
  return new;
end $$;

drop index public.level_submissions_one_pending_idx;
alter table public.level_submissions drop column list, drop column method;  -- drops the SCL method check too
create unique index level_submissions_one_pending_idx on public.level_submissions (submitter_id, gd_id) where status = 'pending';

drop function public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text, text);
create function public.accept_level_submission(
  p_id bigint, p_name text, p_creator text, p_verifier text, p_gd_id bigint, p_video_url text, p_fps text,
  p_position int, p_note text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  new_level bigint;
begin
  perform public.require_rank(2);
  perform 1 from public.level_submissions where id = p_id and status = 'pending' for update;
  if not found then raise exception 'submission not found or already reviewed'; end if;

  new_level := public.add_level(p_name, p_creator, p_verifier, p_gd_id, p_video_url, p_position, p_fps);
  update public.level_submissions set
    status      = 'approved',
    reviewer_id = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(trim(p_note), ''),
    level_id    = new_level
  where id = p_id;
  return new_level;
end $$;

-- Rules: a single set again
delete from public.site_settings where key = 'rules_scl';
alter table public.site_settings drop constraint site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check check (key in ('rules'));

drop function public.set_rules(jsonb, public.list_kind);
create function public.set_rules(p_rules jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb;
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
  values ('rules', p_rules, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

drop type public.list_kind;

------------------------------------------------------------------------------
-- 2. Packs
------------------------------------------------------------------------------
create table public.packs (
  id           bigint generated always as identity primary key,
  name         text not null check (char_length(name) between 1 and 40),
  color        text not null default '#f27a1a' check (color ~ '^#[0-9a-f]{6}$'),
  bonus_points numeric(8, 2) not null default 0 check (bonus_points between 0 and 10000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index packs_name_lower_idx on public.packs (lower(name));

create table public.pack_levels (
  pack_id  bigint not null references public.packs (id) on delete cascade,
  level_id bigint not null references public.levels (id) on delete cascade,  -- removing a level shrinks its packs
  primary key (pack_id, level_id)
);
create index pack_levels_level_idx on public.pack_levels (level_id);

alter table public.packs       enable row level security;
alter table public.pack_levels enable row level security;
create policy "packs readable by everyone" on public.packs for select using (true);
create policy "pack levels readable by everyone" on public.pack_levels for select using (true);

-- Writes only through the functions below
revoke all on public.packs, public.pack_levels from anon, authenticated;
grant select on public.packs, public.pack_levels to anon, authenticated;

-- Create (p_id null) or update a pack and replace its levels.
-- p_bonus null keeps the current bonus (0 for a new pack); changing it needs List Admin+.
create function public.save_pack(p_id bigint, p_name text, p_color text, p_level_ids bigint[], p_bonus numeric default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint := p_id;
  cur numeric;
  n int := coalesce(cardinality(p_level_ids), 0);
begin
  perform public.require_rank(2);
  if n < 1 or n > 100 then raise exception 'a pack needs 1 to 100 levels'; end if;
  if exists (select 1 from unnest(p_level_ids) x where not exists (select 1 from public.levels l where l.id = x)) then
    raise exception 'unknown level in pack';
  end if;

  if v_id is null then
    if coalesce(p_bonus, 0) <> 0 then perform public.require_rank(3); end if;
    insert into public.packs (name, color, bonus_points)
      values (trim(p_name), lower(trim(p_color)), coalesce(p_bonus, 0))
      returning id into v_id;
  else
    select bonus_points into cur from public.packs where id = v_id for update;
    if not found then raise exception 'pack not found'; end if;
    if p_bonus is not null and p_bonus <> cur then perform public.require_rank(3); end if;
    update public.packs set
      name = trim(p_name), color = lower(trim(p_color)), bonus_points = coalesce(p_bonus, cur), updated_at = now()
    where id = v_id;
    delete from public.pack_levels where pack_id = v_id;
  end if;

  insert into public.pack_levels (pack_id, level_id)
    select distinct v_id, x from unnest(p_level_ids) x;
  return v_id;
end $$;

create function public.delete_pack(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_rank(2);
  delete from public.packs where id = p_id;
  if not found then raise exception 'pack not found'; end if;
end $$;

------------------------------------------------------------------------------
-- 3. Leaderboard: level points + bonus of every completed pack
------------------------------------------------------------------------------
create view public.leaderboard with (security_invoker = true) as
with done as (
  select r.player_id, r.level_id, false as verified from public.records r where r.status = 'approved'
  union
  select l.verifier_id, l.id, true from public.levels l where l.verifier_id is not null
), per_level as (
  -- a verifier who also submitted a record counts once
  select player_id, level_id, bool_or(verified) as verified from done group by player_id, level_id
), entries as (
  select p.id, p.username, p.country, true as registered, l.id as level_id, l.position, l.name, d.verified
    from per_level d
    join public.profiles p on p.id = d.player_id and not p.banned
    join public.levels l on l.id = d.level_id
  union all
  select null::uuid, trim(l.verifier), null::text, false, l.id, l.position, l.name, true
    from public.levels l
   where l.verifier_id is null
), pack_size as (
  select pack_id, count(*) as n from public.pack_levels group by pack_id
), packs_done as (
  -- registered players are keyed by id, players without an account by name
  select e.id, e.username, e.registered, pk.bonus_points
    from entries e
    join public.pack_levels pl on pl.level_id = e.level_id
    join public.packs pk on pk.id = pl.pack_id
    join pack_size s on s.pack_id = pl.pack_id
   group by e.id, e.username, e.registered, pk.id, pk.bonus_points, s.n
  having count(distinct e.level_id) = s.n
), bonus as (
  select id, username, registered, sum(bonus_points) as bonus, count(*)::int as packs
    from packs_done group by id, username, registered
), base as (
  select id, username, country, registered,
         sum(public.level_points(position))     as level_points,
         count(*)::int                          as completions,
         min(position)                          as hardest_position,
         (array_agg(name order by position))[1] as hardest_name,
         count(*) filter (where verified)::int  as verifications
    from entries
   group by id, username, country, registered
)
select
  b.id,
  b.username,
  b.country,
  b.level_points + coalesce(x.bonus, 0)                                         as points,
  b.completions,
  b.hardest_position,
  b.hardest_name,
  rank() over (order by b.level_points + coalesce(x.bonus, 0) desc)::int        as rank,
  b.verifications,
  b.registered,
  coalesce(x.bonus, 0)                                                          as pack_bonus,
  coalesce(x.packs, 0)                                                          as packs_completed
from base b
left join bonus x
  on x.registered = b.registered
 and (x.id = b.id or (not b.registered and x.username = b.username));

revoke all on public.leaderboard from anon, authenticated;
grant select on public.leaderboard to anon, authenticated;

------------------------------------------------------------------------------
-- 4. Function privileges (new functions are closed by default — see 0006)
------------------------------------------------------------------------------
revoke execute on function
  public.add_level(text, text, text, bigint, text, int, text),
  public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text),
  public.set_rules(jsonb),
  public.save_pack(bigint, text, text, bigint[], numeric),
  public.delete_pack(bigint)
  from public, anon, authenticated;
grant execute on function
  public.add_level(text, text, text, bigint, text, int, text),
  public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text),
  public.set_rules(jsonb),
  public.save_pack(bigint, text, text, bigint[], numeric),
  public.delete_pack(bigint)
  to authenticated;
