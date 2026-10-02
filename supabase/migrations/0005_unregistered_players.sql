-- ChallengeGrind — players without an account appear in the leaderboard.
-- Today that means verifiers whose name doesn't match any profile (levels.verifier_id is null).
-- Once they register with the exact same username, levels get linked and the entry becomes a real profile.

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
  select p.id, p.username, p.country, true as registered, l.position, l.name, d.verified
    from per_level d
    join public.profiles p on p.id = d.player_id and not p.banned
    join public.levels l on l.id = d.level_id
  union all
  select null::uuid, trim(l.verifier), null::text, false, l.position, l.name, true
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
  rank() over (order by sum(public.level_points(position)) desc)::int as rank,
  count(*) filter (where verified)::int                               as verifications,
  registered
from entries
group by id, username, country, registered;

revoke all on public.leaderboard from anon, authenticated;
grant select on public.leaderboard to anon, authenticated;
