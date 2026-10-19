"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { NotebookPen } from "lucide-react";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { dailyLogMarkdown, OBSIDIAN_SETTING, obsidianUri } from "@/lib/obsidian";
import { targetOn } from "@/lib/progress-logic";
import { dayTarget, isTrainingDay, workoutKcal } from "@/lib/training";

export function useObsidianEnabled(): boolean {
  return useLiveQuery(async () => (await db.meta.get(OBSIDIAN_SETTING))?.value === true, []) ?? false;
}

export async function setObsidianEnabled(on: boolean) {
  await db.meta.put({ key: OBSIDIAN_SETTING, value: on });
}

// Builds the day's note text from the database at tap time, so it always
// has the latest sets and food.
export async function obsidianUriFor(date: string): Promise<string> {
  const [allWorkouts, sets, exercises, entries, allTargets, profile, weights] = await Promise.all([
    db.workouts.toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
    db.foodEntries.where("date").equals(date).toArray(),
    db.targets.toArray(),
    db.profile.get(PROFILE_ID),
    db.weights.toArray(),
  ]);
  const workouts = alive(allWorkouts);
  const targets = alive(allTargets);
  const exerciseNames = new Map(exercises.map((e) => [e.id, e.name]));

  // Same day target as the Food screen shows.
  const base = targetOn(date, targets);
  const plannedDays = profile?.trainingDays ?? [];
  const latestKg = alive(weights).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.kg;
  const dayWorkouts = workouts.filter((w) => w.date === date);
  const training = isTrainingDay(date, new Set(workouts.map((w) => w.date)), plannedDays);
  const extraKcal = profile?.workoutCalories && latestKg ? workoutKcal(dayWorkouts, latestKg) : 0;
  const target = base ? dayTarget(base, { training, plannedPerWeek: plannedDays.length, extraKcal }) : null;

  return obsidianUri(date, dailyLogMarkdown({ date, workouts: dayWorkouts, sets, exerciseNames, entries, targets, dayTarget: target }));
}

// Appends the day's Training and Nutrition to its note in the Obsidian
// vault. Hidden unless turned on in Settings.
export function SendToObsidian({ date, className = "btn w-full" }: { date: string; className?: string }) {
  const enabled = useObsidianEnabled();
  if (!enabled) return null;
  return (
    <button
      className={className}
      onClick={async () => {
        window.location.href = await obsidianUriFor(date);
      }}
    >
      <NotebookPen size={18} /> Send to Obsidian
    </button>
  );
}
