// 100-point scale: 100 × 0.965^(position − 1) — must match public.level_points() in SQL
export const levelPoints = (position: number) => Math.round(100 * Math.pow(0.965, position - 1) * 100) / 100;

export const formatPoints = (p: number) => Number(p).toLocaleString("en-US", { maximumFractionDigits: 2 });
