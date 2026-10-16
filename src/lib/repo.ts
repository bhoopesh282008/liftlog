import { alive, db, PROFILE_ID } from "./db";
import { dateKey } from "./dates";
import { EXERCISE_LIBRARY } from "./data/exercises";
import { SPLIT_TEMPLATES, type SplitTemplateId } from "./data/split-templates";
import { initialTargets, macrosFor, planAdjustment, type BodyStats } from "./targets";
import type {
  Exercise,
  Food,
  FoodEntry,
  Meal,
  PlannedExercise,
  Profile,
  SavedMeal,
  SplitDay,
  SyncFields,
  SyncedTable,
  Target,
  WeightEntry,
  Workout,
  WorkoutSet,
} from "./types";
import { detectPr } from "./workout-logic";

export const newId = () => crypto.randomUUID();

interface RowMap {
  profile: Profile;
  targets: Target;
  exercises: Exercise;
  splitDays: SplitDay;
  workouts: Workout;
  sets: WorkoutSet;
  foods: Food;
  foodEntries: FoodEntry;
  savedMeals: SavedMeal;
  weights: WeightEntry;
}
type Row<T extends SyncedTable> = RowMap[T];

export const CHANGE_EVENT = "lift-log:changed";

// Every write goes through here: stamp it, store it, queue it for sync.
export async function save<T extends SyncedTable>(table: T, row: Omit<Row<T>, "updatedAt"> & Partial<SyncFields>): Promise<Row<T>> {
  const stamped = { ...row, updatedAt: Date.now() } as Row<T>;
  await db.transaction("rw", db.table(table), db.outbox, async () => {
    await db.table(table).put(stamped);
    await db.outbox.add({ table, rowId: stamped.id });
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  return stamped;
}

export async function remove(table: SyncedTable, id: string) {
  const row = await db.table(table).get(id);
  if (row) await save(table, { ...row, deletedAt: Date.now() });
}

// ---------- Onboarding ----------

export interface OnboardingInput extends BodyStats {
  template: SplitTemplateId;
}

export async function completeOnboarding(input: OnboardingInput) {
  const today = dateKey();
  const t = initialTargets(input);
  await seedExercises();
  await save("profile", {
    id: PROFILE_ID,
    sex: input.sex,
    birthYear: new Date().getFullYear() - input.age,
    heightCm: input.heightCm,
    activity: input.activity,
    pace: input.pace,
    autoAdjust: true,
    restSeconds: 120,
    onboarded: true,
  });
  await save("targets", {
    id: newId(),
    date: today,
    calories: t.calories,
    protein: t.protein,
    carbs: t.carbs,
    fat: t.fat,
    source: "initial",
    reason: `Maintenance plus about ${t.surplus} kcal a day for a lean gain.`,
  });
  await logWeight(input.weightKg, today);
  await applyTemplate(input.template);
}

export async function seedExercises() {
  const existing = new Set((await db.exercises.toArray()).map((e) => e.id));
  for (const e of EXERCISE_LIBRARY) {
    if (!existing.has(e.id)) await save("exercises", { ...e, custom: false });
  }
}

export async function applyTemplate(id: SplitTemplateId) {
  for (const d of alive(await db.splitDays.toArray())) await remove("splitDays", d.id);
  const template = SPLIT_TEMPLATES.find((t) => t.id === id)!;
  let order = 0;
  for (const day of template.days) {
    await save("splitDays", { id: newId(), name: day.name, order: order++, exercises: day.exercises });
  }
}

export async function updateProfile(patch: Partial<Profile>) {
  const p = await db.profile.get(PROFILE_ID);
  if (p) await save("profile", { ...p, ...patch });
}

// ---------- Split ----------

export async function saveSplitDay(day: Omit<SplitDay, "updatedAt"> | { name: string; exercises: PlannedExercise[] }) {
  if ("id" in day) return save("splitDays", day);
  const count = alive(await db.splitDays.toArray()).length;
  return save("splitDays", { id: newId(), name: day.name, order: count, exercises: day.exercises });
}

export async function addCustomExercise(name: string, muscle: string) {
  return save("exercises", { id: newId(), name: name.trim(), muscle, custom: true });
}

// ---------- Workouts ----------

export async function activeWorkout(): Promise<Workout | undefined> {
  const open = alive(await db.workouts.filter((w) => !w.finishedAt).toArray());
  return open.sort((a, b) => b.startedAt - a.startedAt)[0];
}

export async function startWorkout(day: SplitDay | null) {
  return save("workouts", {
    id: newId(),
    splitDayId: day?.id ?? null,
    splitDayName: day?.name ?? "Workout",
    date: dateKey(),
    startedAt: Date.now(),
    finishedAt: null,
    extraExerciseIds: [],
  });
}

export async function logSet(workout: Workout, exerciseId: string, weightKg: number, reps: number) {
  const all = alive(await db.sets.where("exerciseId").equals(exerciseId).toArray());
  const history = all.filter((s) => s.workoutId !== workout.id);
  const thisSession = all.filter((s) => s.workoutId === workout.id);
  // First time doing an exercise sets a baseline, not a PR.
  const pr = history.length ? detectPr({ weightKg, reps }, [...history, ...thisSession]) : null;
  return save("sets", {
    id: newId(),
    workoutId: workout.id,
    exerciseId,
    order: thisSession.length,
    weightKg,
    reps,
    loggedAt: Date.now(),
    pr,
  });
}

export async function updateSet(set: WorkoutSet, weightKg: number, reps: number) {
  return save("sets", { ...set, weightKg, reps });
}

export async function finishWorkout(w: Workout) {
  return save("workouts", { ...w, finishedAt: Date.now() });
}

// A workout left open for hours was finished; close it so the rotation moves on.
export async function closeStaleWorkouts(maxIdleMs = 4 * 3600_000) {
  const open = alive(await db.workouts.filter((w) => !w.finishedAt).toArray());
  for (const w of open) {
    const sets = alive(await db.sets.where("workoutId").equals(w.id).toArray());
    const last = Math.max(w.startedAt, ...sets.map((s) => s.loggedAt));
    if (Date.now() - last > maxIdleMs) {
      if (sets.length === 0) await remove("workouts", w.id);
      else await save("workouts", { ...w, finishedAt: last });
    }
  }
}

// ---------- Food ----------

export function mealForNow(d = new Date()): Meal {
  const h = d.getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 19) return "snack";
  return "dinner";
}

export async function ensureFood(food: Omit<Food, "updatedAt">) {
  const existing = await db.foods.get(food.id);
  if (existing && !existing.deletedAt) return existing;
  return save("foods", food);
}

export async function logFood(food: Omit<Food, "updatedAt">, servings: number, meal: Meal, date: string) {
  if (food.source !== "curated") await ensureFood(food);
  return save("foodEntries", {
    id: newId(),
    date,
    meal,
    foodId: food.id,
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    serving: food.serving,
    servings,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    loggedAt: Date.now(),
  });
}

export async function logSavedMeal(meal: SavedMeal, slot: Meal, date: string) {
  const ids: string[] = [];
  for (const item of meal.items) {
    const e = await save("foodEntries", {
      id: newId(),
      date,
      meal: slot,
      foodId: item.foodId,
      name: item.name,
      serving: item.serving,
      servings: item.servings,
      kcal: item.kcal,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      loggedAt: Date.now(),
    });
    ids.push(e.id);
  }
  return ids;
}

export async function saveMealFromEntries(name: string, entries: FoodEntry[]) {
  return save("savedMeals", {
    id: newId(),
    name: name.trim(),
    items: entries.map((e) => ({
      foodId: e.foodId,
      name: e.name,
      serving: e.serving,
      servings: e.servings,
      kcal: e.kcal,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
    })),
  });
}

// ---------- Weight and targets ----------

export async function logWeight(kg: number, date = dateKey()) {
  const sameDay = alive(await db.weights.where("date").equals(date).toArray())[0];
  return save("weights", { id: sameDay?.id ?? newId(), date, kg });
}

export async function currentTarget(): Promise<Target | undefined> {
  const all = alive(await db.targets.toArray());
  return all.sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt).at(-1);
}

export async function setManualTarget(calories: number, latestKg: number, reason = "Set by you.") {
  const m = macrosFor(calories, latestKg);
  return save("targets", { id: newId(), date: dateKey(), ...m, source: "manual", reason });
}

// Runs on app open. Changes the calorie target at most every two weeks.
export async function runAutoAdjust(): Promise<Target | null> {
  const profile = await db.profile.get(PROFILE_ID);
  const current = await currentTarget();
  if (!profile?.autoAdjust || !current) return null;
  const weights = alive(await db.weights.toArray());
  const entries = alive(await db.foodEntries.toArray());
  const result = planAdjustment({
    today: dateKey(),
    current,
    weights,
    loggedFoodDays: [...new Set(entries.map((e) => e.date))],
    pace: profile.pace,
  });
  if (result.kind !== "change") return null;
  const latestKg = weights.sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.kg;
  const m = macrosFor(current.calories + result.delta, latestKg);
  const next = await save("targets", { id: newId(), date: dateKey(), ...m, source: "auto", reason: result.reason });
  await db.meta.put({ key: "unseenAdjustment", value: next.id });
  return next;
}

// Undo restores the previous numbers as a fresh manual target, which also
// restarts the two-week clock so it doesn't immediately change again.
export async function undoAdjustment(t: Target) {
  const before = alive(await db.targets.toArray())
    .filter((x) => x.id !== t.id && (x.date < t.date || (x.date === t.date && x.updatedAt < t.updatedAt)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt)
    .at(-1);
  if (!before) return;
  await save("targets", {
    id: newId(),
    date: dateKey(),
    calories: before.calories,
    protein: before.protein,
    carbs: before.carbs,
    fat: before.fat,
    source: "manual",
    reason: "You undid the automatic change.",
  });
  await db.meta.delete("unseenAdjustment");
}

export async function latestWeight(): Promise<WeightEntry | undefined> {
  return alive(await db.weights.toArray()).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

// ---------- Backup ----------

export async function exportAll() {
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), version: 1 };
  for (const t of ["profile", "targets", "exercises", "splitDays", "workouts", "sets", "foods", "foodEntries", "savedMeals", "weights"] as const) {
    out[t] = alive(await db.table(t).toArray());
  }
  return out;
}
