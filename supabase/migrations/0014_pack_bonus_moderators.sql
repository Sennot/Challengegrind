-- ChallengeGrind — List Moderator+ may set pack bonus points too (was List Admin+ in 0013).
-- p_bonus null still keeps the current bonus (0 for a new pack).

create or replace function public.save_pack(p_id bigint, p_name text, p_color text, p_level_ids bigint[], p_bonus numeric default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint := p_id;
  n int := coalesce(cardinality(p_level_ids), 0);
begin
  perform public.require_rank(2);
  if n < 1 or n > 100 then raise exception 'a pack needs 1 to 100 levels'; end if;
  if exists (select 1 from unnest(p_level_ids) x where not exists (select 1 from public.levels l where l.id = x)) then
    raise exception 'unknown level in pack';
  end if;

  if v_id is null then
    insert into public.packs (name, color, bonus_points)
      values (trim(p_name), lower(trim(p_color)), coalesce(p_bonus, 0))
      returning id into v_id;
  else
    update public.packs set
      name = trim(p_name), color = lower(trim(p_color)), bonus_points = coalesce(p_bonus, bonus_points), updated_at = now()
    where id = v_id;
    if not found then raise exception 'pack not found'; end if;
    delete from public.pack_levels where pack_id = v_id;
  end if;

  insert into public.pack_levels (pack_id, level_id)
    select distinct v_id, x from unnest(p_level_ids) x;
  return v_id;
end $$;
