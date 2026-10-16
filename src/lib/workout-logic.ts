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

// Earlier sessions of one exercise, most recent first, each in set order.
export function previousSessions(
  exerciseId: string,
  currentWorkoutId: string | null,
  workouts: Workout[],
  sets: WorkoutSet[],
  limit = 3,
): WorkoutSet[][] {
  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.workoutId === currentWorkoutId) continue;
    const list = byWorkout.get(s.workoutId) ?? [];
    list.push(s);
    byWorkout.set(s.workoutId, list);
  }
  return workouts
    .filter((w) => byWorkout.has(w.id))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .map((w) => byWorkout.get(w.id)!.sort((a, b) => a.order - b.order));
}

// Sets from the most recent earlier workout that included this exercise.
export function lastSessionSets(
  exerciseId: string,
  currentWorkoutId: string | null,
  workouts: Workout[],
  sets: WorkoutSet[],
): WorkoutSet[] {
  return previousSessions(exerciseId, currentWorkoutId, workouts, sets, 1)[0] ?? [];
}

export interface Progression {
  kind: "increase" | "reps" | "deload";
  weightKg: number;
  reps: number[]; // target for each planned set
  note: string;
}

// Big lower-body lifts move up in 5 kg steps, everything else in 2.5 kg.
const BIG_LOWER = new Set(["squat", "front-squat", "deadlift", "romanian-deadlift", "leg-press", "hack-squat", "hip-thrust"]);
export const incrementFor = (exerciseId: string) => (BIG_LOWER.has(exerciseId) ? 5 : 2.5);

// Double progression: add reps inside the planned range, and once every set
// reaches the top of the range, add weight and drop back to the bottom.
// Three sessions stuck at the same weight call for a ~10% deload.
export function planProgression(
  exerciseId: string,
  plan: { sets: number; repMin: number; repMax: number },
  sessions: Pick<WorkoutSet, "weightKg" | "reps">[][],
): Progression | null {
  const last = sessions[0];
  if (!last?.length) return null;
  const topOf = (s: Pick<WorkoutSet, "weightKg">[]) => Math.max(...s.map((x) => x.weightKg));
  const bestOf = (s: Pick<WorkoutSet, "weightKg" | "reps">[]) => Math.max(...s.map((x) => e1rm(x.weightKg, x.reps)));
  const top = topOf(last);
  const working = last.filter((s) => s.weightKg === top);
  const fill = (reps: number[]) => Array.from({ length: plan.sets }, (_, i) => reps[i] ?? reps[reps.length - 1]);
  const done = working.map((s) => s.reps).join(", ");
  const range = plan.repMin === plan.repMax ? `${plan.repMax}` : `${plan.repMin}–${plan.repMax}`;

  if (working.length >= plan.sets && working.every((s) => s.reps >= plan.repMax)) {
    if (top === 0) {
      return { kind: "reps", weightKg: 0, reps: fill(working.map((s) => s.reps + 1)), note: `You hit ${done} reps, the top of ${range}. Add a rep, or hold a weight.` };
    }
    const inc = incrementFor(exerciseId);
    return {
      kind: "increase",
      weightKg: top + inc,
      reps: fill([plan.repMin]),
      note: `You hit ${done} at ${formatKg(top)}, the top of ${range}. Go up ${inc} kg.`,
    };
  }

  if (top > 0 && sessions.length >= 3) {
    const [a, b, c] = sessions;
    if (topOf(b) === top && topOf(c) === top && bestOf(a) <= bestOf(c) && bestOf(b) <= bestOf(c)) {
      const lighter = Math.max(2.5, Math.round((top * 0.9) / 2.5) * 2.5);
      return {
        kind: "deload",
        weightKg: lighter,
        reps: fill([plan.repMax]),
        note: `Stuck at ${formatKg(top)} for 3 sessions. Drop to ${formatKg(lighter)}, hit ${plan.repMax}s, and build back up.`,
      };
    }
  }

  const reps = fill(working.map((s) => Math.min(plan.repMax, Math.max(plan.repMin, s.reps + 1))));
  return {
    kind: "reps",
    weightKg: top,
    reps,
    note: `Same ${top ? formatKg(top) : "bodyweight"}, one more rep than last time. At ${plan.repMax} on every set, the weight goes up.`,
  };
}

// Pre-fill for the next set: today's target reps, at the weight of the
// previous set this session if there is one (you may have changed it).
export function suggestSet(
  index: number,
  doneThisSession: Pick<WorkoutSet, "weightKg" | "reps">[],
  target: { weightKg: number; reps: number[] } | null,
  repMin: number,
): { weightKg: number; reps: number } | null {
  const prev = doneThisSession[doneThisSession.length - 1];
  const reps = target ? (target.reps[index] ?? target.reps[target.reps.length - 1]) : prev?.reps;
  if (prev) return { weightKg: prev.weightKg, reps: reps ?? prev.reps };
  if (target) return { weightKg: target.weightKg, reps: reps ?? repMin };
  return repMin > 0 ? { weightKg: 0, reps: repMin } : null;
}

// PR flags replayed over an exercise's whole history (oldest first), so
// edited or backfilled sessions stay correct. The first session sets a
// baseline and never counts as a PR.
export function replayPrs(ordered: WorkoutSet[]): Map<string, PrKind | null> {
  const out = new Map<string, PrKind | null>();
  const seen: WorkoutSet[] = [];
  for (const s of ordered) {
    const earlierWorkout = seen.some((h) => h.workoutId !== s.workoutId);
    out.set(s.id, earlierWorkout ? detectPr(s, seen) : null);
    seen.push(s);
  }
  return out;
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
