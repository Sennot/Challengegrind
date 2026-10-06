-- ChallengeGrind — level submissions: creator, publisher, verifier

alter table public.level_submissions
  add column creator   text not null check (char_length(creator) between 1 and 128),
  add column publisher text not null check (char_length(publisher) between 1 and 64),
  add column verifier  text not null check (char_length(verifier) between 1 and 64);

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

grant insert (creator, publisher, verifier) on public.level_submissions to authenticated;
