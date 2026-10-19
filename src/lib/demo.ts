import { CURATED_FOODS } from "./data/indian-foods";
import { EXERCISE_LIBRARY } from "./data/exercises";
import { SPLIT_TEMPLATES } from "./data/split-templates";
import { addDays, dateKey, parseKey } from "./dates";
import { db, PROFILE_ID } from "./db";
import { newId } from "./repo";
import { stepsRecordId } from "./steps";
import { MODE_PROTEIN, modeTargets } from "./targets";
import type { DayLog, Food, FoodEntry, Meal, Workout, WorkoutSet } from "./types";

export const DEMO_FLAG = "demo";

// "Try the demo": four weeks of a believable lifter's data, written straight
// into IndexedDB. Rows skip the sync outbox on purpose, so demo data can
// never upload to an account; leaving the demo wipes the device instead.
export async function seedDemo(now = new Date()) {
  const today = dateKey(now);
  const start = addDays(today, -27);
  const stats = { sex: "male" as const, age: 26, heightCm: 176, weightKg: 72.4, activity: "moderate" as const };
  const t = modeTargets(stats, "bulk");
  const stamp = { updatedAt: Date.now() };

  const template = SPLIT_TEMPLATES.find((x) => x.id === "ppl")!;
  const splitDays = template.days.map((d, order) => ({ id: newId(), name: d.name, order, exercises: d.exercises, ...stamp }));

  // Push / Pull / Legs on Mon, Wed, Fri, with weights creeping up each week.
  const workouts: Workout[] = [];
  const sets: WorkoutSet[] = [];
  let n = 0;
  for (let i = 0; i < 28; i++) {
    const date = addDays(start, i);
    if (date === today || ![1, 3, 5].includes(parseKey(date).getDay())) continue;
    const day = splitDays[n++ % splitDays.length];
    const week = Math.floor(i / 7);
    const startedAt = parseKey(date).getTime() + 18 * 3600_000;
    const id = newId();
    workouts.push({ id, splitDayId: day.id, splitDayName: day.name, date, startedAt, finishedAt: startedAt + (48 + (i % 3) * 6) * 60_000, extraExerciseIds: [], ...stamp });
    let order = 0;
    day.exercises.slice(0, 4).forEach((plan, ei) => {
      const base = [60, 42.5, 50, 22.5][ei] + week * 2.5;
      for (let s = 0; s < Math.min(plan.sets, 3); s++) {
        sets.push({
          id: newId(),
          workoutId: id,
          exerciseId: plan.exerciseId,
          order: order++,
          weightKg: base,
          reps: Math.max(plan.repMin, plan.repMax - s),
          loggedAt: startedAt + order * 150_000,
          pr: week === 3 && s === 0 && ei < 2 ? "weight" : null,
          ...stamp,
        });
      }
    });
  }

  // Body weight: a slow lean bulk, logged most mornings.
  const weights = Array.from({ length: 28 }, (_, i) => i)
    .filter((i) => i % 2 === 0 || i === 27)
    .map((i) => ({ id: newId(), date: addDays(start, i), kg: Math.round((72.4 + i * 0.03 + ((i * 7) % 5) * 0.08) * 10) / 10, ...stamp }));

  // A week of meals, ending with a partly logged today.
  const food = (...ids: string[]) => ids.map((x) => CURATED_FOODS.find((f) => f.id === `curated:${x}`)).find(Boolean) as Food | undefined;
  const plan: [Meal, Food | undefined, number][] = [
    ["breakfast", food("oats-milk", "poha"), 1],
    ["breakfast", food("boiled-egg", "egg-boiled", "omelette"), 2],
    ["lunch", food("rajma", "dal-tadka"), 1],
    ["lunch", food("rice", "jeera-rice"), 1],
    ["snack", food("curd", "greek-yogurt", "sprouts"), 1],
    ["dinner", food("chicken-curry", "paneer-bhurji", "chole"), 1],
    ["dinner", food("roti", "phulka"), 3],
  ];
  const entries: FoodEntry[] = [];
  for (let back = 6; back >= 0; back--) {
    const date = addDays(today, -back);
    const meals = back === 0 ? plan.slice(0, 4) : plan;
    meals.forEach(([meal, f, servings], k) => {
      if (!f) return;
      entries.push({
        id: newId(),
        date,
        meal,
        foodId: f.id,
        name: f.name,
        serving: f.serving,
        servings,
        kcal: f.kcal * servings,
        protein: f.protein * servings,
        carbs: f.carbs * servings,
        fat: f.fat * servings,
        loggedAt: parseKey(date).getTime() + (8 + k * 2) * 3600_000,
        ...stamp,
      });
    });
  }

  // Water and steps for the week.
  const days: DayLog[] = [];
  for (let back = 6; back >= 0; back--) {
    const date = addDays(today, -back);
    days.push({ id: date, date, waterGlasses: back === 0 ? 5 : 9 + (back % 3), creatine: back !== 0, ...stamp });
    days.push({ id: stepsRecordId(date), date, waterGlasses: 0, creatine: false, steps: back === 0 ? 4200 : [7400, 9100, 6300, 11200, 8600, 5200][back - 1], ...stamp });
  }

  await db.transaction("rw", [db.profile, db.targets, db.exercises, db.splitDays, db.workouts, db.sets, db.weights, db.foodEntries, db.days, db.meta], async () => {
    await db.exercises.bulkPut(EXERCISE_LIBRARY.map((e) => ({ ...e, custom: false, ...stamp })));
    await db.profile.put({
      id: PROFILE_ID,
      sex: stats.sex,
      birthYear: now.getFullYear() - stats.age,
      heightCm: stats.heightCm,
      activity: stats.activity,
      pace: "standard",
      mode: "bulk",
      proteinPerKg: MODE_PROTEIN.bulk,
      autoAdjust: true,
      restSeconds: 120,
      onboarded: true,
      trainingDays: [1, 3, 5],
      ...stamp,
    });
    await db.targets.put({ id: newId(), date: start, calories: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat, source: "initial", reason: "Demo targets.", ...stamp });
    await db.splitDays.bulkPut(splitDays);
    await db.workouts.bulkPut(workouts);
    await db.sets.bulkPut(sets);
    await db.weights.bulkPut(weights);
    await db.foodEntries.bulkPut(entries);
    await db.days.bulkPut(days);
    await db.meta.put({ key: DEMO_FLAG, value: true });
  });
}

// Leaving the demo wipes this device's database, then reloads to a fresh start.
export async function exitDemo() {
  await db.delete();
  window.location.replace("/onboarding");
}
