-- ChallengeGrind — level submissions (players suggest levels, List Moderator+ review them)
-- Accepting a submission puts the level on the list (via add_level) in the same transaction.

create table public.level_submissions (
  id           bigint generated always as identity primary key,
  submitter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  gd_id        bigint not null check (gd_id > 0),
  fps          text not null check (fps ~ '^[A-Za-z0-9 /+.-]{1,20}$'),
  name         text not null check (char_length(name) between 1 and 64),
  video_url    text not null check (
    char_length(video_url) <= 300
    and video_url ~ '^https://((www\.|m\.)?youtube\.com|youtu\.be|t\.me|telegram\.me)/'
  ),
  placement    text not null check (char_length(placement) between 1 and 500),
  telegram     text not null check (telegram ~ '^[A-Za-z0-9_]{4,32}$'),
  status       public.record_status not null default 'pending',
  reviewer_id  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text check (char_length(review_note) <= 300),
  level_id     bigint references public.levels (id) on delete set null,
  created_at   timestamptz not null default now()
);
-- One pending submission of the same level per player
create unique index level_submissions_one_pending_idx on public.level_submissions (submitter_id, gd_id) where status = 'pending';
create index level_submissions_submitter_idx on public.level_submissions (submitter_id);
create index level_submissions_status_idx on public.level_submissions (status);

-- Guard inserts: force pending, limit open submissions, skip levels already on the list
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

create trigger level_submissions_before_insert
  before insert on public.level_submissions
  for each row execute function public.level_submissions_before_insert();

-- Accept: add the level to the list (moderator may correct the data) and close the submission
create or replace function public.accept_level_submission(
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

create or replace function public.reject_level_submission(p_id bigint, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_note text := nullif(trim(p_note), '');
begin
  perform public.require_rank(2);
  if v_note is null then raise exception 'a reason is required when rejecting'; end if;
  update public.level_submissions set
    status      = 'rejected',
    reviewer_id = auth.uid(),
    reviewed_at = now(),
    review_note = v_note
  where id = p_id and status = 'pending';
  if not found then raise exception 'submission not found or already reviewed'; end if;
end $$;

-- Bans also reject pending level submissions
CREATE OR REPLACE FUNCTION public.set_user_ban(p_user_id uuid, p_banned boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
       set status = 'rejected', reviewer_id = auth.uid(), reviewed_at = now(), review_note = 'Player banned'
     where player_id = p_user_id and status = 'pending';
    update public.level_submissions
       set status = 'rejected', reviewer_id = auth.uid(), reviewed_at = now(), review_note = 'Player banned'
     where submitter_id = p_user_id and status = 'pending';
    delete from auth.sessions where user_id = p_user_id;
  end if;
end $function$;

------------------------------------------------------------------------------
-- Row Level Security & privileges
-- Submissions contain a Telegram contact: visible only to the submitter and List Moderator+.
------------------------------------------------------------------------------
alter table public.level_submissions enable row level security;

create policy "submitter or moderator reads" on public.level_submissions for select
  to authenticated using (submitter_id = auth.uid() or public.my_rank() >= 2);
create policy "players submit own levels" on public.level_submissions for insert
  to authenticated with check (submitter_id = auth.uid() and not public.is_banned(auth.uid()));
create policy "cancel own pending or as moderator" on public.level_submissions for delete
  to authenticated using ((submitter_id = auth.uid() and status = 'pending') or public.my_rank() >= 2);

revoke all on public.level_submissions from anon, authenticated;
grant select, delete on public.level_submissions to authenticated;
grant insert (gd_id, fps, name, video_url, placement, telegram) on public.level_submissions to authenticated;

revoke execute on function
  public.level_submissions_before_insert(),
  public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text),
  public.reject_level_submission(bigint, text)
  from public, anon, authenticated;
grant execute on function
  public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text),
  public.reject_level_submission(bigint, text)
  to authenticated;
