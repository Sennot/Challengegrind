// 100-point scale: 100 × 0.965^(position − 1) — must match public.level_points() in SQL
export const levelPoints = (position: number) => Math.round(100 * Math.pow(0.965, position - 1) * 100) / 100;

/** One format for every score: always two decimals ("100.00", "1,154.72") */
export const formatPoints = (p: number) => Number(p).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Pack bonuses are whole numbers in practice: "+30", "+12.5" */
export const formatBonus = (p: number) => `+${Number(p).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
