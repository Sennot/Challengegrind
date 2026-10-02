// Formula A: 300 × 0.965^(position − 1) — must match public.level_points() in SQL
export const levelPoints = (position: number) => Math.round(300 * Math.pow(0.965, position - 1) * 100) / 100;

export const formatPoints = (p: number) => Number(p).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
