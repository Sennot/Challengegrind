-- ChallengeGrind — fix review_record ambiguity, editable rules.

------------------------------------------------------------------------------
-- review_record: local variable "note" clashed with records.note
------------------------------------------------------------------------------
create or replace function public.review_record(p_record_id bigint, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_note text := nullif(trim(p_note), '');
begin
  perform public.require_rank(1);
  if not p_approve and v_note is null then
    raise exception 'a reason is required when rejecting';
  end if;
  update public.records set
    status      = case when p_approve then 'approved'::public.record_status else 'rejected'::public.record_status end,
    reviewer_id = auth.uid(),
    reviewed_at = now(),
    review_note = v_note
  where id = p_record_id;
  if not found then raise exception 'record not found'; end if;
end $$;

------------------------------------------------------------------------------
-- Site settings (editable content). Rules: [{ "title": text, "items": [text] }]
------------------------------------------------------------------------------
create table public.site_settings (
  key        text primary key check (key in ('rules')),
  value      jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
create policy "settings readable by everyone" on public.site_settings for select using (true);

revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;

-- Writes only through this function (List Admin+), with shape validation
create or replace function public.set_rules(p_rules jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb;
begin
  perform public.require_rank(3);
  if jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) > 30 then
    raise exception 'rules must be an array of at most 30 sections';
  end if;
  for s in select * from jsonb_array_elements(p_rules) loop
    if jsonb_typeof(s -> 'title') <> 'string' or char_length(s ->> 'title') not between 1 and 120
       or jsonb_typeof(s -> 'items') <> 'array' or jsonb_array_length(s -> 'items') > 40
       or exists (select 1 from jsonb_array_elements(s -> 'items') i
                  where jsonb_typeof(i) <> 'string' or char_length(i #>> '{}') not between 1 and 600) then
      raise exception 'invalid rules section';
    end if;
  end loop;

  insert into public.site_settings (key, value, updated_by, updated_at)
  values ('rules', p_rules, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

revoke execute on function public.set_rules(jsonb) from public, anon, authenticated;
grant execute on function public.set_rules(jsonb) to authenticated;
