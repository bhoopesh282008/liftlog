import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { addDays, dateKey, parseKey } from "@/lib/dates";
import { builtinFoods } from "@/lib/data/food-sources";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { sumMacros, targetOn } from "@/lib/progress-logic";
import { quickAddFoods } from "@/lib/protein";
import { bodyOf, maintenanceCalories, modeOf, perKgFor } from "@/lib/targets";
import { dayTarget, isTrainingDay, workoutKcal, workoutPhase } from "@/lib/training";

export type FoodDay = NonNullable<ReturnType<typeof useFoodDay>>;

// Everything the Food screen shows for one day: the live data, that day's
// entries and totals, and its target (shifted for training or rest).
// Null until the first read from the local database lands.
export function useFoodDay(date: string) {
  const data = useLiveQuery(async () => {
    const [entries, foods, savedMeals, targets, unseen, profile, weights, workouts] = await Promise.all([
      db.foodEntries.toArray(),
      db.foods.toArray(),
      db.savedMeals.toArray(),
      db.targets.toArray(),
      db.meta.get("unseenAdjustment"),
      db.profile.get(PROFILE_ID),
      db.weights.toArray(),
      db.workouts.toArray(),
    ]);
    const liveTargets = alive(targets);
    return {
      entries: alive(entries),
      foods: alive(foods),
      savedMeals: alive(savedMeals),
      targets: liveTargets,
      adjustment: liveTargets.find((t) => t.id === unseen?.value) ?? null,
      perKg: perKgFor(profile),
      mode: modeOf(profile),
      body: profile ? bodyOf(profile) : null,
      diet: profile?.diet,
      trainingDays: profile?.trainingDays ?? [],
      workoutCalories: Boolean(profile?.workoutCalories),
      workouts: alive(workouts),
      now: Date.now(),
      latestKg: alive(weights).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.kg ?? null,
    };
  }, []);

  const candidates = useMemo(
    () => [...builtinFoods().filter((b) => b.common).map((b) => b.food), ...(data?.foods ?? [])],
    [data?.foods],
  );

  const useCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data?.entries ?? []) m.set(e.foodId, (m.get(e.foodId) ?? 0) + 1);
    return m;
  }, [data]);

  const quick = useMemo(() => quickAddFoods(builtinFoods(), data?.diet), [data?.diet]);

  if (!data) return null;

  const isToday = date === dateKey();
  const dayEntries = data.entries.filter((e) => e.date === date).sort((a, b) => a.loggedAt - b.loggedAt);
  const prevEntries = data.entries.filter((e) => e.date === addDays(date, -1)).sort((a, b) => a.loggedAt - b.loggedAt);
  const totals = sumMacros(dayEntries);
  const base = targetOn(date, data.targets);
  const dayWorkouts = data.workouts.filter((w) => w.date === date);
  const plannedToday = data.trainingDays.includes(parseKey(date).getDay());
  const training = isTrainingDay(date, new Set(data.workouts.map((w) => w.date)), data.trainingDays);
  const extraKcal = data.workoutCalories && data.latestKg ? workoutKcal(dayWorkouts, data.latestKg) : 0;
  const t = base ? dayTarget(base, { training, plannedPerWeek: data.trainingDays.length, extraKcal }) : null;
  const dayNote = t
    ? [
        t.shift > 0 ? `Training day: +${t.shift} kcal, all carbs` : t.shift < 0 ? `Rest day: −${-t.shift} kcal from carbs` : training ? "Training day" : "",
        t.workoutKcal ? `+${t.workoutKcal} kcal for today's workout (estimate)` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const phase = isToday ? workoutPhase(data.now, dayWorkouts, plannedToday) : null;
  const maintenance = data.body && data.latestKg ? Math.round(maintenanceCalories({ ...data.body, weightKg: data.latestKg })) : null;

  return { data, candidates, useCounts, quick, isToday, dayEntries, prevEntries, totals, t, dayNote, training, phase, maintenance };
}
