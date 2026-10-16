import { addDays, daysBetween, weekStart } from "./dates";
import { weeklyTrendKg } from "./targets";
import type { FoodEntry, Macros, Target, WeightEntry, Workout, WorkoutSet } from "./types";

export function entryTotals(e: Pick<FoodEntry, keyof Macros | "servings">): Macros {
  return {
    kcal: e.kcal * e.servings,
    protein: e.protein * e.servings,
    carbs: e.carbs * e.servings,
    fat: e.fat * e.servings,
  };
}

export function sumMacros(entries: Pick<FoodEntry, keyof Macros | "servings">[]): Macros {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) {
    const t = entryTotals(e);
    total.kcal += t.kcal;
    total.protein += t.protein;
    total.carbs += t.carbs;
    total.fat += t.fat;
  }
  return total;
}

export function weeklyWeightAverages(weights: Pick<WeightEntry, "date" | "kg">[]) {
  const weeks = new Map<string, number[]>();
  for (const w of weights) {
    const key = weekStart(w.date);
    weeks.set(key, [...(weeks.get(key) ?? []), w.kg]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, kgs]) => ({
      date: week,
      value: Math.round((kgs.reduce((a, b) => a + b, 0) / kgs.length) * 10) / 10,
    }));
}

// The target in force on a given day is the latest one dated on or before it.
export function targetOn(date: string, targets: Target[]): Target | null {
  let found: Target | null = null;
  for (const t of targets) {
    if (t.date <= date && (!found || t.date > found.date || (t.date === found.date && t.updatedAt > found.updatedAt))) {
      found = t;
    }
  }
  return found;
}

export interface DayAdherence {
  date: string;
  logged: boolean;
  proteinHit: boolean;
  caloriesHit: boolean;
}

// Protein counts as hit at 95% of target; calories within ±10%.
export function adherence(
  days: string[],
  entries: FoodEntry[],
  targets: Target[],
): DayAdherence[] {
  const byDay = new Map<string, FoodEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return days.map((date) => {
    const list = byDay.get(date) ?? [];
    const t = targetOn(date, targets);
    const sum = sumMacros(list);
    return {
      date,
      logged: list.length > 0,
      proteinHit: !!t && list.length > 0 && sum.protein >= t.protein * 0.95,
      caloriesHit: !!t && list.length > 0 && Math.abs(sum.kcal - t.calories) <= t.calories * 0.1,
    };
  });
}

export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

// ---------- Training consistency ----------

// Weeks in a row (Mon–Sun) with at least `minPerWeek` workouts. The current
// week only counts once it qualifies, so a quiet Monday never breaks a streak.
export function weekStreak(workoutDates: string[], today: string, minPerWeek = 2): number {
  const perWeek = new Map<string, number>();
  for (const d of workoutDates) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
  let week = weekStart(today);
  if ((perWeek.get(week) ?? 0) < minPerWeek) week = addDays(week, -7);
  let streak = 0;
  while ((perWeek.get(week) ?? 0) >= minPerWeek) {
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

// Working sets per muscle group between two dates (inclusive).
export function setsPerMuscle(
  sets: Pick<WorkoutSet, "workoutId" | "exerciseId">[],
  workouts: Pick<Workout, "id" | "date">[],
  muscleOf: Map<string, string>,
  from: string,
  to: string,
): Map<string, number> {
  const inRange = new Set(workouts.filter((w) => w.date >= from && w.date <= to).map((w) => w.id));
  const out = new Map<string, number>();
  for (const s of sets) {
    if (!inRange.has(s.workoutId)) continue;
    const m = muscleOf.get(s.exerciseId);
    if (m) out.set(m, (out.get(m) ?? 0) + 1);
  }
  return out;
}

// ---------- Intake ----------

export function dailyTotals(entries: FoodEntry[]): Map<string, Macros> {
  const byDay = new Map<string, FoodEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return new Map([...byDay.entries()].map(([d, list]) => [d, sumMacros(list)]));
}

// Weekly averages over the days that were logged (unlogged days are unknown,
// not zero).
export function weeklyIntake(totals: Map<string, Macros>, from: string, to: string) {
  const weeks = new Map<string, Macros[]>();
  for (const [d, m] of totals) {
    if (d < from || d > to) continue;
    weeks.set(weekStart(d), [...(weeks.get(weekStart(d)) ?? []), m]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      kcal: Math.round(list.reduce((a, m) => a + m.kcal, 0) / list.length),
      protein: Math.round(list.reduce((a, m) => a + m.protein, 0) / list.length),
      days: list.length,
    }));
}

// Real-world maintenance: what you ate on average, minus the energy that went
// into (or came out of) body weight. Needs steady logging to be trustworthy.
export function estimateMaintenance(
  totals: Map<string, Macros>,
  weights: Pick<WeightEntry, "date" | "kg">[],
  today: string,
  windowDays = 21,
): { kcal: number; intake: number; trend: number; loggedDays: number } | null {
  const from = addDays(today, -windowDays + 1);
  const logged = [...totals.entries()].filter(([d, m]) => d >= from && d <= today && m.kcal > 0);
  const w = weights.filter((x) => x.date >= from && x.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  if (logged.length < 10 || w.length < 4 || daysBetween(w[0].date, w[w.length - 1].date) < 10) return null;
  const intake = logged.reduce((a, [, m]) => a + m.kcal, 0) / logged.length;
  const trend = weeklyTrendKg(w)!;
  const kcal = Math.round((intake - (trend * 7700) / 7) / 50) * 50;
  return { kcal, intake: Math.round(intake), trend, loggedDays: logged.length };
}
