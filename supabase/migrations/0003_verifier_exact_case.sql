-- ChallengeGrind — verifier is linked only on an exact (case-sensitive) username match.
-- Run in Supabase → SQL Editor after 0002_update1.sql.

create or replace function public.levels_link_verifier() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.verifier_id := (select id from public.profiles where username = trim(new.verifier));
  return new;
end $$;

create or replace function public.profiles_link_verifications() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.levels set verifier_id = new.id
   where verifier_id is null and trim(verifier) = new.username;
  return new;
end $$;

-- Re-link existing levels with the new rule
update public.levels l
   set verifier_id = (select p.id from public.profiles p where p.username = trim(l.verifier));
