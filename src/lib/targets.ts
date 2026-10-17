import { daysBetween, parseKey } from "./dates";
import type { Activity, GoalMode, Profile, Sex, Target, WeightEntry } from "./types";

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

// Calories above (+) or below (−) maintenance for each goal.
export const MODE_ADJUST: Record<GoalMode, number> = {
  bulk: 0.1,
  cut: -0.2,
  recomp: -0.05,
  maintenance: 0,
};

// Default protein per kg for each goal. A deficit takes the top of the
// 1.6–2.2 g/kg range to hold on to muscle.
export const MODE_PROTEIN: Record<GoalMode, number> = {
  bulk: 2,
  cut: 2.2,
  recomp: 2.2,
  maintenance: 1.8,
};

export const MODE_LABELS: Record<GoalMode, { label: string; detail: string }> = {
  bulk: { label: "Bulk", detail: "Build muscle with a small surplus" },
  cut: { label: "Cut", detail: "Lose fat and keep your muscle" },
  recomp: { label: "Recomp", detail: "Lose fat slowly while building muscle" },
  maintenance: { label: "Maintain", detail: "Hold your weight steady" },
};

export const GOAL_MODES = Object.keys(MODE_ADJUST) as GoalMode[];

// Profiles from before goal modes were lean-gain only.
export const modeOf = (p: Pick<Profile, "mode"> | undefined): GoalMode => p?.mode ?? "bulk";

// Protein per kg: your own choice, else the goal's default.
export const perKgFor = (p: Pick<Profile, "mode" | "proteinPerKg"> | undefined) => p?.proteinPerKg ?? MODE_PROTEIN[modeOf(p)];

export const PROTEIN_G_PER_KG = 2;

// Daily protein per kg of body weight. Around 1.6 g/kg captures most of the
// muscle-building benefit; going higher adds a margin and keeps you fuller.
export const PROTEIN_LEVELS: { perKg: number; label: string; detail: string }[] = [
  { perKg: 1.6, label: "1.6 g/kg", detail: "Enough for most of the muscle gain" },
  { perKg: 1.8, label: "1.8 g/kg", detail: "Default for maintaining" },
  { perKg: 2, label: "2.0 g/kg", detail: "Default for bulking: a safety margin for lean gaining" },
  { perKg: 2.2, label: "2.2 g/kg", detail: "Default for cut and recomp: protects muscle in a deficit" },
];

export const proteinFor = (weightKg: number, perKg = PROTEIN_G_PER_KG) => round(weightKg * perKg, 5);
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
}

export const bodyOf = (p: Pick<Profile, "sex" | "birthYear" | "heightCm" | "activity">, now = new Date()): Omit<BodyStats, "weightKg"> => ({
  sex: p.sex,
  age: ageFrom(p.birthYear, now),
  heightCm: p.heightCm,
  activity: p.activity,
});

const round = (n: number, step: number) => Math.round(n / step) * step;

// Mifflin–St Jeor resting energy.
export function bmr({ sex, age, heightCm, weightKg }: BodyStats): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

export function maintenanceCalories(stats: BodyStats): number {
  return bmr(stats) * ACTIVITY_FACTORS[stats.activity];
}

export function macrosFor(calories: number, weightKg: number, perKg = PROTEIN_G_PER_KG) {
  const protein = proteinFor(weightKg, perKg);
  const fat = round((calories * FAT_SHARE) / 9, 5);
  const carbs = Math.max(0, round((calories - protein * 4 - fat * 9) / 4, 5));
  return { calories, protein, carbs, fat };
}

// Calories are maintenance moved by the goal's percentage, rounded to 50.
export function modeTargets(stats: BodyStats, mode: GoalMode, perKg = MODE_PROTEIN[mode]) {
  const maintenance = Math.round(maintenanceCalories(stats));
  const calories = round(maintenance * (1 + MODE_ADJUST[mode]), 50);
  return { ...macrosFor(calories, stats.weightKg, perKg), maintenance };
}

// The planned weekly weight change: the goal's daily surplus or deficit
// turned into body weight. Negative for cut and recomp.
export function modeWeeklyChangeKg(stats: BodyStats, mode: GoalMode): number {
  return (maintenanceCalories(stats) * MODE_ADJUST[mode] * 7) / KCAL_PER_KG;
}

export const formatAdjust = (mode: GoalMode) => {
  const a = MODE_ADJUST[mode];
  return a === 0 ? "±0%" : `${a > 0 ? "+" : "−"}${Math.round(Math.abs(a) * 100)}%`;
};

// The working behind the targets, one line per step, for showing the user.
export function modeFormula(stats: BodyStats, mode: GoalMode, perKg = MODE_PROTEIN[mode]): string[] {
  const t = modeTargets(stats, mode, perKg);
  const n = (x: number) => x.toLocaleString("en-IN");
  return [
    `Maintenance: ${n(Math.round(bmr(stats)))} kcal resting (Mifflin–St Jeor) × ${ACTIVITY_FACTORS[stats.activity]} activity ≈ ${n(t.maintenance)} kcal`,
    `${MODE_LABELS[mode].label}: ${n(t.maintenance)} ${formatAdjust(mode)} = ${n(t.calories)} kcal, rounded to 50`,
    `Protein ${perKg.toFixed(1)} g × ${stats.weightKg} kg = ${t.protein} g · fat 25% of calories = ${t.fat} g · carbs the rest = ${t.carbs} g`,
  ];
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
  mode: GoalMode;
  body: Omit<BodyStats, "weightKg">;
}

export type AdjustmentResult =
  | { kind: "wait"; reason: string }
  | { kind: "on_pace"; reason: string; trend: number; goal: number }
  | { kind: "change"; delta: number; reason: string; trend: number; goal: number };

// The goal's planned weekly change is the yardstick: a cut expects loss, a
// bulk expects gain, maintenance expects neither.
export function planAdjustment({ today, current, weights, loggedFoodDays, mode, body }: AdjustmentInput): AdjustmentResult {
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
  const goal = modeWeeklyChangeKg({ ...body, weightKg: avgKg }, mode);
  const tolerance = Math.max(0.1, Math.abs(goal) * 0.5);
  const diff = goal - trend;
  if (Math.abs(diff) <= tolerance) {
    return { kind: "on_pace", reason: "Weight is moving at the planned pace", trend, goal };
  }
  const raw = round((diff * KCAL_PER_KG) / 7, 50);
  const magnitude = Math.min(MAX_STEP, Math.max(MIN_STEP, Math.abs(raw)));
  const delta = Math.sign(diff) * magnitude;
  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)} kg/week`;
  const plan = `the ${fmt(goal)} ${MODE_LABELS[mode].label.toLowerCase()} plan`;
  const reason =
    delta > 0
      ? `Weight trend was ${fmt(trend)}, below ${plan}, so calories went up ${delta}.`
      : `Weight trend was ${fmt(trend)}, above ${plan}, so calories went down ${-delta}.`;
  return { kind: "change", delta, reason, trend, goal };
}

export function ageFrom(birthYear: number, now = new Date()): number {
  return now.getFullYear() - birthYear;
}
