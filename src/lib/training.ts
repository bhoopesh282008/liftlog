import { parseKey } from "./dates";
import type { Target, Workout } from "./types";

// Training days get this share of the day's calories on top, all as carbs.
// Rest days give the same amount back, so the week's total stays the same.
export const TRAINING_SHIFT = 0.1;

// Moderate-to-hard weight training (Compendium of Physical Activities).
export const LIFTING_MET = 5;
const MAX_WORKOUT_MIN = 180;

export const GLASS_ML = 250;

// Planned weekdays use Date.getDay(): 0 is Sunday.
export function isTrainingDay(date: string, workoutDates: Set<string>, plannedDays: number[] | undefined): boolean {
  return workoutDates.has(date) || (plannedDays ?? []).includes(parseKey(date).getDay());
}

// Estimated energy for lifting: MET × kg × hours. Only finished workouts
// count, each capped at 3 hours so a session left open doesn't inflate it.
export function workoutKcal(workouts: Pick<Workout, "startedAt" | "finishedAt">[], weightKg: number, met = LIFTING_MET): number {
  const minutes = workouts.reduce(
    (a, w) => a + (w.finishedAt ? Math.min(MAX_WORKOUT_MIN, Math.max(0, (w.finishedAt - w.startedAt) / 60_000)) : 0),
    0,
  );
  return Math.round((met * weightKg * minutes) / 60 / 10) * 10;
}

export interface DayTarget extends Pick<Target, "calories" | "protein" | "carbs" | "fat"> {
  // Calories moved onto (+) or off (−) this day by the training split.
  shift: number;
  // Estimated workout calories added, when that setting is on.
  workoutKcal: number;
}

const round = (n: number, step: number) => Math.round(n / step) * step;

// The day's target from the base target: carbs move toward planned training
// days and away from rest days. With no plan (or training every day) there
// is no week to balance, so only the workout estimate applies.
export function dayTarget(
  base: Pick<Target, "calories" | "protein" | "carbs" | "fat">,
  { training, plannedPerWeek, extraKcal = 0 }: { training: boolean; plannedPerWeek: number; extraKcal?: number },
): DayTarget {
  const n = Math.min(7, Math.max(0, plannedPerWeek));
  const up = base.calories * TRAINING_SHIFT;
  const shift = n === 0 || n === 7 ? 0 : round(training ? up : (-up * n) / (7 - n), 10);
  const calories = base.calories + shift + extraKcal;
  return {
    calories,
    protein: base.protein,
    carbs: Math.max(0, round(base.carbs + (shift + extraKcal) / 4, 5)),
    fat: base.fat,
    shift,
    workoutKcal: extraKcal,
  };
}

// 35 ml per kg, plus 500 ml on training days, in 250 ml glasses.
export function waterGoalGlasses(weightKg: number, training: boolean): number {
  return Math.ceil((weightKg * 35 + (training ? 500 : 0)) / GLASS_ML);
}

export type WorkoutPhase = "pre" | "post";

// Which card to show today: "pre" on a planned day before any workout is
// logged, "post" during a workout and for 3 hours after it ends.
export function workoutPhase(
  now: number,
  today: Pick<Workout, "startedAt" | "finishedAt">[],
  planned: boolean,
): WorkoutPhase | null {
  if (today.length === 0) return planned ? "pre" : null;
  if (today.some((w) => !w.finishedAt)) return "post";
  const lastEnd = Math.max(...today.map((w) => w.finishedAt!));
  // A session backfilled for later today hasn't ended yet, so no card.
  return now >= lastEnd && now - lastEnd <= 3 * 3600_000 ? "post" : null;
}
