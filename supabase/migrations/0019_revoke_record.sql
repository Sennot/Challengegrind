-- ChallengeGrind — List Helper+ can remove an accepted record (with a reason).
-- The record becomes "rejected" (it leaves the list and the leaderboard, the player sees the reason),
-- the player gets a notification and the staff log gets a "record_revoked" entry.

alter table public.staff_log drop constraint staff_log_action_check;
alter table public.staff_log add constraint staff_log_action_check check (action in (
  'record_approved', 'record_rejected', 'record_deleted', 'record_revoked',
  'level_added', 'level_moved', 'level_removed', 'level_edited',
  'submission_approved', 'submission_rejected', 'submission_deleted',
  'pack_created', 'pack_edited', 'pack_deleted',
  'role_changed', 'user_banned', 'user_unbanned', 'password_reset',
  'rules_updated'));

create or replace function public.revoke_record(p_record_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := nullif(trim(p_reason), '');
  r record;
begin
  perform public.require_rank(1);
  if v_reason is null then raise exception 'a reason is required'; end if;
  if char_length(v_reason) > 300 then raise exception 'the reason is too long (max 300)'; end if;

  select rec.id, rec.player_id, rec.level_id, rec.video_url, rec.status, l.name as level_name
    into r
    from public.records rec join public.levels l on l.id = rec.level_id
   where rec.id = p_record_id
   for update of rec;
  if not found then raise exception 'record not found'; end if;
  if r.status <> 'approved' then raise exception 'only accepted records can be removed'; end if;

  update public.records
     set status = 'rejected', review_note = v_reason, reviewer_id = auth.uid(), reviewed_at = now()
   where id = p_record_id;

  perform public.notify(r.player_id, 'record_rejected', 'Your record was removed',
    format('Your record on %s was removed by staff: %s', r.level_name, v_reason), '/level/' || r.level_id);
  perform public.log_action('record_revoked', r.player_id, r.level_id,
    jsonb_build_object('reason', v_reason, 'video', r.video_url));
end $$;

revoke execute on function public.revoke_record(bigint, text) from public, anon;
grant execute on function public.revoke_record(bigint, text) to authenticated;
