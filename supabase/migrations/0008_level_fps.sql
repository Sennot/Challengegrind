-- ChallengeGrind — FPS of a level ("240", "360", "CBF", "240 / CBF", …)

alter table public.levels
  add column fps text check (fps ~ '^[A-Za-z0-9 /+.-]{1,20}$');

grant update (fps) on public.levels to authenticated;

drop function public.add_level(text, text, text, bigint, text, int);
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

revoke execute on function public.add_level(text, text, text, bigint, text, int, text) from public, anon, authenticated;
grant execute on function public.add_level(text, text, text, bigint, text, int, text) to authenticated;
