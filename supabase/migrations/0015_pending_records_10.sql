-- ChallengeGrind — a player may have up to 10 pending records (was 5)

create or replace function public.records_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.status := 'pending';
  new.reviewer_id := null;
  new.reviewed_at := null;
  new.review_note := null;
  new.created_at := now();
  if (select count(*) from public.records where player_id = new.player_id and status = 'pending') >= 10 then
    raise exception 'too many pending records (max 10)';
  end if;
  return new;
end $$;
