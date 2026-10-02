-- ChallengeGrind — initial schema
-- Run in Supabase → SQL Editor (or `supabase db push`).

------------------------------------------------------------------------------
-- Types & helpers
------------------------------------------------------------------------------
create type public.app_role as enum ('player', 'helper', 'moderator', 'admin', 'owner');
create type public.record_status as enum ('pending', 'approved', 'rejected');
create type public.change_kind as enum ('added', 'moved', 'removed');

create or replace function public.role_rank(r public.app_role) returns int
language sql immutable set search_path = '' as $$
  select case r
    when 'player' then 0 when 'helper' then 1 when 'moderator' then 2
    when 'admin' then 3 when 'owner' then 4 end
$$;

-- Points formula (variant A): 300 × 0.965^(position − 1)
create or replace function public.level_points(pos int) returns numeric
language sql immutable set search_path = '' as $$
  select round(300 * power(0.965::numeric, (pos - 1)::numeric), 2)
$$;

------------------------------------------------------------------------------
-- Profiles
------------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  country    text check (country ~ '^[a-z]{2}$'),
  bio        text check (char_length(bio) <= 300),
  role       public.app_role not null default 'player',
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- Rank of the current caller (-1 for anonymous / no profile)
create or replace function public.my_rank() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select public.role_rank(p.role) from public.profiles p where p.id = auth.uid()),
    -1)
$$;

create or replace function public.require_rank(min_rank int) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.my_rank() < min_rank then
    raise exception 'insufficient permissions' using errcode = '42501';
  end if;
end $$;

-- Create a profile for every new auth user (username comes from signup metadata)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uname text := new.raw_user_meta_data ->> 'username';
begin
  if uname is null or uname !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'invalid username';
  end if;
  insert into public.profiles (id, username) values (new.id, uname);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username))
$$;

------------------------------------------------------------------------------
-- Levels & changelog
------------------------------------------------------------------------------
create table public.levels (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 64),
  creator    text not null check (char_length(creator) between 1 and 128),
  verifier   text not null check (char_length(verifier) between 1 and 64),
  gd_id      bigint check (gd_id > 0),
  video_url  text check (video_url ~ '^https://' and char_length(video_url) <= 300),
  position   int not null check (position >= 1),
  created_at timestamptz not null default now(),
  constraint levels_position_unique unique (position) deferrable initially deferred
);

create table public.changelog (
  id           bigint generated always as identity primary key,
  kind         public.change_kind not null,
  level_id     bigint references public.levels (id) on delete set null,
  level_name   text not null,
  old_position int,
  new_position int,
  prev_name    text,  -- level directly above (position − 1)  → "ниже X"
  next_name    text,  -- level directly below (position + 1)  → "выше Y"
  actor        uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index changelog_created_idx on public.changelog (created_at desc);

create or replace function public.add_level(
  p_name text, p_creator text, p_verifier text, p_gd_id bigint, p_video_url text, p_position int
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
  insert into public.levels (name, creator, verifier, gd_id, video_url, position)
    values (trim(p_name), trim(p_creator), trim(p_verifier), p_gd_id, nullif(trim(p_video_url), ''), p_position)
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

------------------------------------------------------------------------------
-- Records (100% only, video required)
------------------------------------------------------------------------------
create table public.records (
  id            bigint generated always as identity primary key,
  level_id      bigint not null references public.levels (id) on delete cascade,
  player_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  video_url     text not null check (video_url ~ '^https://' and char_length(video_url) <= 300),
  note          text check (char_length(note) <= 500),
  status        public.record_status not null default 'pending',
  reviewer_id   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  reject_reason text check (char_length(reject_reason) <= 300),
  created_at    timestamptz not null default now()
);
-- One active (pending/approved) record per player per level
create unique index records_one_active_idx on public.records (level_id, player_id) where status <> 'rejected';
create index records_player_idx on public.records (player_id);
create index records_status_idx on public.records (status);

-- Guard inserts: force pending status and limit open submissions
create or replace function public.records_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.status := 'pending';
  new.reviewer_id := null;
  new.reviewed_at := null;
  new.reject_reason := null;
  new.created_at := now();
  if (select count(*) from public.records where player_id = new.player_id and status = 'pending') >= 5 then
    raise exception 'too many pending records (max 5)';
  end if;
  return new;
end $$;

create trigger records_before_insert
  before insert on public.records
  for each row execute function public.records_before_insert();

create or replace function public.review_record(p_record_id bigint, p_approve boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_rank(1);
  update public.records set
    status        = case when p_approve then 'approved'::public.record_status else 'rejected'::public.record_status end,
    reviewer_id   = auth.uid(),
    reviewed_at   = now(),
    reject_reason = case when p_approve then null else nullif(trim(p_reason), '') end
  where id = p_record_id;
  if not found then raise exception 'record not found'; end if;
end $$;

------------------------------------------------------------------------------
-- Roles management
------------------------------------------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller int := public.my_rank();
  target public.app_role;
begin
  perform public.require_rank(3);
  if p_user_id = auth.uid() then raise exception 'cannot change your own role'; end if;
  select role into target from public.profiles where id = p_user_id;
  if not found then raise exception 'user not found'; end if;
  if public.role_rank(target) >= caller or public.role_rank(p_role) >= caller then
    raise exception 'insufficient permissions' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end $$;

------------------------------------------------------------------------------
-- Leaderboard (Stats Viewer)
------------------------------------------------------------------------------
create view public.leaderboard with (security_invoker = true) as
select
  p.id,
  p.username,
  p.country,
  sum(public.level_points(l.position))                       as points,
  count(*)::int                                              as completions,
  min(l.position)                                            as hardest_position,
  (array_agg(l.name order by l.position))[1]                 as hardest_name,
  rank() over (order by sum(public.level_points(l.position)) desc)::int as rank
from public.profiles p
join public.records r on r.player_id = p.id and r.status = 'approved'
join public.levels l on l.id = r.level_id
group by p.id;

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.levels    enable row level security;
alter table public.changelog enable row level security;
alter table public.records   enable row level security;

create policy "profiles readable by everyone" on public.profiles for select using (true);
create policy "users edit own profile" on public.profiles for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "levels readable by everyone" on public.levels for select using (true);
create policy "moderators edit level info" on public.levels for update
  to authenticated using (public.my_rank() >= 2) with check (public.my_rank() >= 2);

create policy "changelog readable by everyone" on public.changelog for select using (true);

create policy "records visibility" on public.records for select using (
  status = 'approved' or player_id = auth.uid() or public.my_rank() >= 1
);
create policy "players submit own records" on public.records for insert
  to authenticated with check (player_id = auth.uid());
create policy "delete own pending or as moderator" on public.records for delete
  to authenticated using ((player_id = auth.uid() and status = 'pending') or public.my_rank() >= 2);

------------------------------------------------------------------------------
-- Privileges (Supabase grants everything by default — lock it down)
------------------------------------------------------------------------------
revoke all on public.profiles, public.levels, public.changelog, public.records, public.leaderboard
  from anon, authenticated;

grant select on public.profiles, public.levels, public.changelog, public.records, public.leaderboard
  to anon, authenticated;
grant update (country, bio) on public.profiles to authenticated;
grant update (name, creator, verifier, gd_id, video_url) on public.levels to authenticated;
grant insert (level_id, video_url, note) on public.records to authenticated;
grant delete on public.records to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.role_rank(public.app_role), public.level_points(int), public.my_rank()
  to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function
  public.add_level(text, text, text, bigint, text, int),
  public.move_level(bigint, int),
  public.remove_level(bigint),
  public.review_record(bigint, boolean, text),
  public.set_user_role(uuid, public.app_role)
  to authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

------------------------------------------------------------------------------
-- Realtime (live changelog & list)
------------------------------------------------------------------------------
alter publication supabase_realtime add table public.changelog, public.levels;
