-- Points formula: 100-point scale, 100 × 0.965^(position − 1)
-- Leaderboard is a view over level_points(), so totals recalculate automatically.
create or replace function public.level_points(pos int) returns numeric
language sql immutable set search_path = '' as $$
  select round(100 * power(0.965::numeric, (pos - 1)::numeric), 2)
$$;
