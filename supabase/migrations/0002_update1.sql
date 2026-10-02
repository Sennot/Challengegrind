-- ChallengeGrind — update 1
-- Socials, bans, review notes, verifier points.
-- Run in Supabase → SQL Editor after 0001_init.sql.

------------------------------------------------------------------------------
-- Profiles: socials & bans
------------------------------------------------------------------------------
alter table public.profiles
  add column social_telegram text check (social_telegram ~ '^[A-Za-z0-9_]{4,32}$'),
  add column social_discord  text check (social_discord ~ '^[a-z0-9_.]{2,32}$'),
  add column social_youtube  text check (social_youtube ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/' and char_length(social_youtube) <= 200),
  add column social_twitch   text check (social_twitch ~ '^[A-Za-z0-9_]{3,25}$'),
  add column banned          boolean not null default false,
  add column ban_reason      text check (char_length(ban_reason) <= 300);

create or replace function public.is_banned(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select banned from public.profiles where id = p_user), false)
$$;

drop policy "users edit own profile" on public.profiles;
create policy "users edit own profile" on public.profiles for update
  to authenticated
  using (id = auth.uid() and not public.is_banned(auth.uid()))
  with check (id = auth.uid());

grant update (social_telegram, social_discord, social_youtube, social_twitch) on public.profiles to authenticated;

drop policy "players submit own records" on public.records;
create policy "players submit own records" on public.records for insert
  to authenticated
  with check (player_id = auth.uid() and not public.is_banned(auth.uid()));

------------------------------------------------------------------------------
-- Records: review note (optional on approve, required on reject)
------------------------------------------------------------------------------
alter table public.records rename column reject_reason to review_note;

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

-- Bans (List Admin+): hides from leaderboard, blocks submissions, rejects pending records
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
  end if;
end $$;

drop function public.review_record(bigint, boolean, text);
create function public.review_record(p_record_id bigint, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  note text := nullif(trim(p_note), '');
begin
  perform public.require_rank(1);
  if not p_approve and note is null then
    raise exception 'a reason is required when rejecting';
  end if;
  update public.records set
    status      = case when p_approve then 'approved'::public.record_status else 'rejected'::public.record_status end,
    reviewer_id = auth.uid(),
    reviewed_at = now(),
    review_note = note
  where id = p_record_id;
  if not found then raise exception 'record not found'; end if;
end $$;

------------------------------------------------------------------------------
-- Verifiers get points: link levels.verifier to a profile by username
------------------------------------------------------------------------------
alter table public.levels add column verifier_id uuid references public.profiles (id) on delete set null;

create or replace function public.levels_link_verifier() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.verifier_id := (select id from public.profiles where lower(username) = lower(trim(new.verifier)));
  return new;
end $$;

create trigger levels_link_verifier
  before insert or update of verifier on public.levels
  for each row execute function public.levels_link_verifier();

-- When someone registers with a verifier's name, link their verifications
create or replace function public.profiles_link_verifications() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.levels set verifier_id = new.id
   where verifier_id is null and lower(trim(verifier)) = lower(new.username);
  return new;
end $$;

create trigger profiles_link_verifications
  after insert on public.profiles
  for each row execute function public.profiles_link_verifications();

update public.levels l set verifier_id = p.id
  from public.profiles p where lower(trim(l.verifier)) = lower(p.username);

------------------------------------------------------------------------------
-- Leaderboard: approved records + verifications, banned players hidden
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
)
select
  p.id,
  p.username,
  p.country,
  sum(public.level_points(l.position))                                  as points,
  count(*)::int                                                         as completions,
  min(l.position)                                                       as hardest_position,
  (array_agg(l.name order by l.position))[1]                            as hardest_name,
  rank() over (order by sum(public.level_points(l.position)) desc)::int  as rank,
  count(*) filter (where d.verified)::int                               as verifications
from per_level d
join public.profiles p on p.id = d.player_id and not p.banned
join public.levels l on l.id = d.level_id
group by p.id;

revoke all on public.leaderboard from anon, authenticated;
grant select on public.leaderboard to anon, authenticated;

------------------------------------------------------------------------------
-- Function privileges
------------------------------------------------------------------------------
revoke execute on function
  public.is_banned(uuid),
  public.set_user_ban(uuid, boolean, text),
  public.review_record(bigint, boolean, text),
  public.levels_link_verifier(),
  public.profiles_link_verifications()
  from public, anon, authenticated;

grant execute on function public.is_banned(uuid) to anon, authenticated;
grant execute on function public.set_user_ban(uuid, boolean, text), public.review_record(bigint, boolean, text) to authenticated;
