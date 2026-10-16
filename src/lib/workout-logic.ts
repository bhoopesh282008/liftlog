import type { PrKind, SplitDay, Workout, WorkoutSet } from "./types";

// Epley estimated one-rep max. Above 12 reps the estimate gets unreliable,
// so those sets count at 12.
export function e1rm(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + Math.min(reps, 12) / 30);
}

// The next day in the rotation follows the last finished workout, whatever
// the date, so a missed day never skips anything.
export function nextSplitDay(days: SplitDay[], workouts: Workout[]): SplitDay | null {
  const ordered = [...days].sort((a, b) => a.order - b.order);
  if (ordered.length === 0) return null;
  const finished = workouts
    .filter((w) => w.finishedAt && w.splitDayId)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  for (const w of finished) {
    const idx = ordered.findIndex((d) => d.id === w.splitDayId);
    if (idx >= 0) return ordered[(idx + 1) % ordered.length];
  }
  return ordered[0];
}

// A set is a PR when it beats every earlier set of that exercise on weight
// or on estimated 1RM. With no history there is nothing to beat.
export function detectPr(
  set: Pick<WorkoutSet, "weightKg" | "reps">,
  history: Pick<WorkoutSet, "weightKg" | "reps">[],
): PrKind | null {
  if (history.length === 0 || set.reps <= 0) return null;
  const bestWeight = Math.max(...history.map((s) => s.weightKg));
  const bestE1rm = Math.max(...history.map((s) => e1rm(s.weightKg, s.reps)));
  if (set.weightKg > bestWeight) return "weight";
  if (e1rm(set.weightKg, set.reps) > bestE1rm + 0.01) return "e1rm";
  return null;
}

// Sets from the most recent earlier workout that included this exercise.
export function lastSessionSets(
  exerciseId: string,
  currentWorkoutId: string | null,
  workouts: Workout[],
  sets: WorkoutSet[],
): WorkoutSet[] {
  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.workoutId === currentWorkoutId) continue;
    const list = byWorkout.get(s.workoutId) ?? [];
    list.push(s);
    byWorkout.set(s.workoutId, list);
  }
  const candidates = workouts
    .filter((w) => byWorkout.has(w.id))
    .sort((a, b) => b.startedAt - a.startedAt);
  if (candidates.length === 0) return [];
  return byWorkout.get(candidates[0].id)!.sort((a, b) => a.order - b.order);
}

// Pre-fill for the next set: repeat this session's previous set, else the
// matching set from last time, else last time's final set.
export function suggestSet(
  index: number,
  doneThisSession: WorkoutSet[],
  lastTime: WorkoutSet[],
  repMin: number,
): { weightKg: number; reps: number } | null {
  const prev = doneThisSession[doneThisSession.length - 1];
  if (prev) return { weightKg: prev.weightKg, reps: prev.reps };
  const match = lastTime[index] ?? lastTime[lastTime.length - 1];
  if (match) return { weightKg: match.weightKg, reps: match.reps };
  return repMin > 0 ? { weightKg: 0, reps: repMin } : null;
}

export function formatSets(sets: Pick<WorkoutSet, "weightKg" | "reps">[]): string {
  if (sets.length === 0) return "";
  const sameWeight = sets.every((s) => s.weightKg === sets[0].weightKg);
  if (sameWeight) return `${formatKg(sets[0].weightKg)} × ${sets.map((s) => s.reps).join(", ")}`;
  return sets.map((s) => `${formatKg(s.weightKg)}×${s.reps}`).join(", ");
}

export function formatKg(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1).replace(/\.0$/, "")} kg`;
}

// Best estimated 1RM per workout for one exercise, oldest first.
export function e1rmHistory(exerciseId: string, workouts: Workout[], sets: WorkoutSet[]) {
  const best = new Map<string, number>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId) continue;
    best.set(s.workoutId, Math.max(best.get(s.workoutId) ?? 0, e1rm(s.weightKg, s.reps)));
  }
  return workouts
    .filter((w) => best.has(w.id))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((w) => ({ date: w.date, value: Math.round(best.get(w.id)! * 10) / 10 }));
}
