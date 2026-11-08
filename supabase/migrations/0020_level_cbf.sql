-- ChallengeGrind — CBF per level: "yes" (allowed), "no" (not allowed) or "required".
-- Shown on the level card as "CBF: Yes / No / Required"; staff set it when adding or editing a level.

alter table public.levels
  add column cbf text not null default 'yes' check (cbf in ('yes', 'no', 'required'));
grant update (cbf) on public.levels to authenticated;

drop function public.add_level(text, text, text, bigint, text, int, text);
create function public.add_level(
  p_name text, p_creator text, p_verifier text, p_gd_id bigint, p_video_url text, p_position int, p_fps text default null,
  p_cbf text default 'yes'
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
  insert into public.levels (name, creator, verifier, gd_id, video_url, position, fps, cbf)
    values (trim(p_name), trim(p_creator), trim(p_verifier), p_gd_id, nullif(trim(p_video_url), ''), p_position, nullif(trim(p_fps), ''),
            coalesce(p_cbf, 'yes'))
    returning id into new_id;

  select name into prev_n from public.levels where position = p_position - 1;
  select name into next_n from public.levels where position = p_position + 1;
  insert into public.changelog (kind, level_id, level_name, new_position, prev_name, next_name, actor)
    values ('added', new_id, trim(p_name), p_position, prev_n, next_n, auth.uid());
  return new_id;
end $$;
revoke execute on function public.add_level(text, text, text, bigint, text, int, text, text) from public, anon;
grant execute on function public.add_level(text, text, text, bigint, text, int, text, text) to authenticated;

-- Staff log: CBF edits too
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
  if new.cbf       is distinct from old.cbf       then changes := changes || jsonb_build_object('cbf',      jsonb_build_array(old.cbf, new.cbf)); end if;
  if changes <> '{}' then
    perform public.log_action('level_edited', null, new.id, jsonb_build_object('changes', changes));
  end if;
  return null;
end $$;

-- Accepting a level submission sets CBF too
drop function public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text);
create function public.accept_level_submission(
  p_id bigint, p_name text, p_creator text, p_verifier text, p_gd_id bigint, p_video_url text, p_fps text,
  p_position int, p_note text default null, p_cbf text default 'yes'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  new_level bigint;
begin
  perform public.require_rank(2);
  perform 1 from public.level_submissions where id = p_id and status = 'pending' for update;
  if not found then raise exception 'submission not found or already reviewed'; end if;

  new_level := public.add_level(p_name, p_creator, p_verifier, p_gd_id, p_video_url, p_position, p_fps, p_cbf);
  update public.level_submissions set
    status      = 'approved',
    reviewer_id = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(trim(p_note), ''),
    level_id    = new_level
  where id = p_id;
  return new_level;
end $$;
revoke execute on function public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text, text) from public, anon;
grant execute on function public.accept_level_submission(bigint, text, text, text, bigint, text, text, int, text, text) to authenticated;

-- Current levels: CBF allowed everywhere except these two
update public.levels set cbf = 'no' where id in (1, 119);  -- Transcended Flight, Nine jumps of hell
