import { sumMacros, targetOn } from "./progress-logic";
import type { FoodEntry, Target, Workout, WorkoutSet } from "./types";
import { e1rm } from "./workout-logic";

// The user's vault and its Daily notes folder (YYYY-MM-DD names).
export const OBSIDIAN_VAULT = "LiftLog";
export const OBSIDIAN_FOLDER = "Journal";

// Per-device setting in db.meta: Obsidian may only be on some devices.
export const OBSIDIAN_SETTING = "obsidianExport";

export interface DayInput {
  date: string;
  workouts: Workout[];
  sets: WorkoutSet[];
  exerciseNames: Map<string, string>;
  entries: FoodEntry[];
  targets: Target[];
  // The day's adjusted target as the Food screen shows it (training-day
  // carbs, workout calories). Without it the base target for the date is used.
  dayTarget?: Pick<Target, "calories" | "protein"> | null;
}

const kg = (n: number) => (n === 0 ? "BW" : `${Number.isInteger(n) ? n : n.toFixed(1).replace(/\.0$/, "")} kg`);
const showSet = (s: Pick<WorkoutSet, "weightKg" | "reps">) => `${kg(s.weightKg)} × ${s.reps}`;
// Top set: highest estimated 1RM; more reps break ties (bodyweight sets).
const best = <T extends Pick<WorkoutSet, "weightKg" | "reps">>(sets: T[]) =>
  sets.reduce((a, b) => ((e1rm(b.weightKg, b.reps) - e1rm(a.weightKg, a.reps) || b.reps - a.reps) > 0 ? b : a));

// The day's Training and Nutrition sections, matching the vault's
// Templates/Daily Log so appended text lines up with the note's headings.
export function dailyLogMarkdown({ date, workouts, sets, exerciseNames, entries, targets, dayTarget }: DayInput): string {
  const dayWorkouts = workouts.filter((w) => w.date === date && !w.deletedAt).sort((a, b) => a.startedAt - b.startedAt);
  const ids = new Set(dayWorkouts.map((w) => w.id));
  const daySets = sets.filter((s) => ids.has(s.workoutId) && !s.deletedAt).sort((a, b) => a.loggedAt - b.loggedAt || a.order - b.order);
  // Sessions with sets; a session started with none logged still names the day.
  const withSets = dayWorkouts.filter((w) => daySets.some((s) => s.workoutId === w.id));
  const trained = withSets.length ? withSets : dayWorkouts;

  // Exercises in the order they were first logged.
  const byExercise = new Map<string, WorkoutSet[]>();
  for (const s of daySets) byExercise.set(s.exerciseId, [...(byExercise.get(s.exerciseId) ?? []), s]);
  const name = (id: string) => exerciseNames.get(id) ?? "Exercise";

  const split = trained.length
    ? trained
        .map((w) => {
          const min = w.finishedAt ? Math.round((w.finishedAt - w.startedAt) / 60_000) : null;
          return min ? `${w.splitDayName} (${min} min)` : w.splitDayName;
        })
        .join(" + ")
    : "Rest day";
  const topSets = [...byExercise].map(([id, s]) => `${name(id)} ${showSet(best(s))}`);
  const prs = [...byExercise]
    .map(([id, s]) => [id, s.filter((x) => x.pr)] as const)
    .filter(([, s]) => s.length)
    .map(([id, s]) => `${name(id)} ${showSet(best(s))}`);

  const dayEntries = entries.filter((e) => e.date === date && !e.deletedAt);
  const eaten = dayEntries.length ? sumMacros(dayEntries) : null;
  const t = dayTarget ?? targetOn(date, targets.filter((x) => !x.deletedAt));
  const vs = (value: number | undefined, target: number | undefined, unit: string) => {
    const v = value === undefined ? "not logged" : `${Math.round(value)}`;
    if (!target) return value === undefined ? v : `${v} ${unit}`;
    const pct = value === undefined ? "" : ` (${Math.round((value / target) * 100)}%)`;
    return `${v} / ${target} ${unit}${pct}`;
  };

  return [
    "## Training",
    `- Day / split: ${split}`,
    `- Top sets: ${topSets.join(" · ") || "None"}`,
    `- PRs: ${prs.join(" · ") || "None"}`,
    "",
    "## Nutrition",
    `- Protein: ${vs(eaten?.protein, t?.protein, "g")}`,
    `- Calories: ${vs(eaten?.kcal, t?.calories, "kcal")}`,
    "",
  ].join("\n");
}

// Appends to the day's note, creating it if missing. The file is named
// explicitly (not obsidian://daily) so a session sent after midnight still
// lands on the day it happened. Values must be URI encoded, "/" included.
export function obsidianUri(date: string, content: string, vault = OBSIDIAN_VAULT, folder = OBSIDIAN_FOLDER): string {
  const params: [string, string][] = [
    ["vault", vault],
    ["file", `${folder}/${date}`],
    ["content", `\n${content}`],
    ["append", "true"],
  ];
  return `obsidian://new?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}
