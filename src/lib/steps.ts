import { addDays } from "./dates";
import type { DayLog } from "./types";

export const DEFAULT_STEP_GOAL = 8000;

// Steps live in their own day record, apart from water and supplements.
// Sync resolves conflicts per record, so a count sent from Safari (by the
// Shortcut) can never reset that day's water.
export const stepsRecordId = (date: string) => `${date}:steps`;
export const isStepsRecord = (d: Pick<DayLog, "id">) => d.id.endsWith(":steps");
export const MAX_STEPS = 100_000;

// Steps from a form field or the Shortcut's URL: digits only (commas and
// spaces are dropped, so "8,123" works), whole numbers in 0–100,000.
// Anything else is null.
export function parseSteps(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const clean = raw.replace(/[\s,._]/g, "");
  if (!/^\d+$/.test(clean)) return null;
  const n = Number(clean);
  return n <= MAX_STEPS ? n : null;
}

// Walking burns about 0.0005 kcal per step per kg of body weight
// (roughly 40 kcal per 1,000 steps at 80 kg).
export function stepsKcal(steps: number, weightKg: number): number {
  return Math.round(steps * weightKg * 0.0005);
}

// Steps for the 7 days ending on `date`, oldest first; days with no log are 0.
export function weekSteps(days: Pick<DayLog, "id" | "date" | "steps" | "deletedAt">[], date: string): { date: string; steps: number }[] {
  const byDate = new Map(days.filter((d) => !d.deletedAt && isStepsRecord(d)).map((d) => [d.date, d.steps ?? 0]));
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(date, i - 6);
    return { date: d, steps: byDate.get(d) ?? 0 };
  });
}
