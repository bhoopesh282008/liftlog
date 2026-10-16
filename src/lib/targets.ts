import { daysBetween, parseKey } from "./dates";
import type { Activity, GainPace, Sex, Target, WeightEntry } from "./types";

export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: "Desk job, little walking",
  light: "Lifting 3 days a week",
  moderate: "Lifting 4–5 days a week",
  active: "Lifting 6 days, active job",
  very_active: "Hard training plus physical job",
};

// Lean-gain pace as a share of body weight per month.
export const PACE_PERCENT_PER_MONTH: Record<GainPace, number> = {
  slow: 0.5,
  standard: 1,
  fast: 1.5,
};

export const PACE_LABELS: Record<GainPace, string> = {
  slow: "Slow and very lean",
  standard: "Standard lean gain",
  fast: "Faster, a bit more fat",
};

export const PROTEIN_G_PER_KG = 2;
const FAT_SHARE = 0.25;
const KCAL_PER_KG = 7700;
const ADJUST_EVERY_DAYS = 14;
const MAX_STEP = 150;
const MIN_STEP = 100;

export interface BodyStats {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  pace: GainPace;
}

const round = (n: number, step: number) => Math.round(n / step) * step;

export function targetWeeklyGainKg(weightKg: number, pace: GainPace): number {
  return (weightKg * PACE_PERCENT_PER_MONTH[pace]) / 100 * (12 / 52);
}

// Mifflin–St Jeor resting energy.
export function bmr({ sex, age, heightCm, weightKg }: BodyStats): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

export function maintenanceCalories(stats: BodyStats): number {
  return bmr(stats) * ACTIVITY_FACTORS[stats.activity];
}

export function macrosFor(calories: number, weightKg: number) {
  const protein = round(weightKg * PROTEIN_G_PER_KG, 5);
  const fat = round((calories * FAT_SHARE) / 9, 5);
  const carbs = Math.max(0, round((calories - protein * 4 - fat * 9) / 4, 5));
  return { calories, protein, carbs, fat };
}

export function initialTargets(stats: BodyStats) {
  const surplus = (targetWeeklyGainKg(stats.weightKg, stats.pace) * KCAL_PER_KG) / 7;
  const calories = round(maintenanceCalories(stats) + surplus, 50);
  return { ...macrosFor(calories, stats.weightKg), surplus: round(surplus, 10) };
}

// Weekly weight change from a least-squares fit, which is far less noisy
// than comparing two single weigh-ins.
export function weeklyTrendKg(weights: Pick<WeightEntry, "date" | "kg">[]): number | null {
  if (weights.length < 2) return null;
  const t0 = parseKey(weights[0].date).getTime();
  const xs = weights.map((w) => (parseKey(w.date).getTime() - t0) / 86_400_000);
  const ys = weights.map((w) => w.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}

export interface AdjustmentInput {
  today: string;
  current: Target;
  weights: Pick<WeightEntry, "date" | "kg">[];
  loggedFoodDays: string[];
  pace: GainPace;
}

export type AdjustmentResult =
  | { kind: "wait"; reason: string }
  | { kind: "on_pace"; reason: string; trend: number; goal: number }
  | { kind: "change"; delta: number; reason: string; trend: number; goal: number };

export function planAdjustment({ today, current, weights, loggedFoodDays, pace }: AdjustmentInput): AdjustmentResult {
  const sinceChange = daysBetween(current.date, today);
  if (sinceChange < ADJUST_EVERY_DAYS) {
    return { kind: "wait", reason: `Next check in ${ADJUST_EVERY_DAYS - sinceChange} days` };
  }
  const windowStart = current.date;
  const recent = weights
    .filter((w) => w.date >= windowStart && w.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (recent.length < 4 || daysBetween(recent[0].date, recent[recent.length - 1].date) < 10) {
    return { kind: "wait", reason: "Weigh in at least 4 times over 2 weeks so the trend is reliable" };
  }
  const logged = new Set(loggedFoodDays.filter((d) => d >= windowStart && d <= today));
  if (logged.size < 8) {
    return { kind: "wait", reason: "Log food on at least 8 of the last 14 days before targets change" };
  }

  const trend = weeklyTrendKg(recent)!;
  const avgKg = recent.reduce((a, w) => a + w.kg, 0) / recent.length;
  const goal = targetWeeklyGainKg(avgKg, pace);
  const tolerance = Math.max(0.1, goal * 0.5);
  const diff = goal - trend;
  if (Math.abs(diff) <= tolerance) {
    return { kind: "on_pace", reason: "Weight is moving at the planned pace", trend, goal };
  }
  const raw = round((diff * KCAL_PER_KG) / 7, 50);
  const magnitude = Math.min(MAX_STEP, Math.max(MIN_STEP, Math.abs(raw)));
  const delta = Math.sign(diff) * magnitude;
  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)} kg/week`;
  const reason =
    delta > 0
      ? `Weight trend was ${fmt(trend)}, below the ${fmt(goal)} goal, so calories went up ${delta}.`
      : `Weight trend was ${fmt(trend)}, faster than the ${fmt(goal)} goal, so calories went down ${-delta} to keep the gain lean.`;
  return { kind: "change", delta, reason, trend, goal };
}

export function ageFrom(birthYear: number, now = new Date()): number {
  return now.getFullYear() - birthYear;
}
