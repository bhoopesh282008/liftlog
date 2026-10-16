// Dates are stored as local calendar keys (YYYY-MM-DD) so "today" matches
// the user's clock, not UTC.

export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000);
}

// Monday of the week containing the date.
export function weekStart(key: string): string {
  const d = parseKey(key);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return dateKey(d);
}

export function formatDay(key: string, today = dateKey()): string {
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  return parseKey(key).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatShort(key: string): string {
  return parseKey(key).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
