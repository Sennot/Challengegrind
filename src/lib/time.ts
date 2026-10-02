const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

const STEPS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.345, "week"],
  [12, "month"],
  [Infinity, "year"],
];

export function timeAgo(iso: string): string {
  let value = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [size, unit] of STEPS) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return "";
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
