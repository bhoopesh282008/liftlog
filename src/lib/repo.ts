import { alive, db, PROFILE_ID, SYNCED_TABLES } from "./db";
import { dateKey } from "./dates";
import { EXERCISE_LIBRARY } from "./data/exercises";
import { CURATED_FOODS } from "./data/indian-foods";
import { SPLIT_TEMPLATES, type SplitTemplateId } from "./data/split-templates";
import {
  bodyOf,
  formatAdjust,
  macrosFor,
  MODE_LABELS,
  MODE_PROTEIN,
  modeOf,
  modeTargets,
  perKgFor,
  planAdjustment,
  proteinFor,
  type BodyStats,
} from "./targets";
import type {
  DayLog,
  Exercise,
  Food,
  FoodEntry,
  GoalMode,
  Meal,
  PlannedExercise,
  Profile,
  SavedMeal,
  SplitDay,
  SupplementId,
  SyncFields,
  SyncedTable,
  Target,
  WeightEntry,
  Workout,
  WorkoutSet,
} from "./types";
import { stepsRecordId } from "./steps";
import { SUPPLEMENTS, takenOf } from "./supplements";
import { detectPr, replayPrs } from "./workout-logic";

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
  days: DayLog;
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
  mode: GoalMode;
  template: SplitTemplateId;
}

const modeReason = (mode: GoalMode, t: { maintenance: number; calories: number }) =>
  `${MODE_LABELS[mode].label}: maintenance ${t.maintenance.toLocaleString("en-IN")} kcal ${formatAdjust(mode)} = ${t.calories.toLocaleString("en-IN")} kcal.`;

export async function completeOnboarding(input: OnboardingInput) {
  const today = dateKey();
  const t = modeTargets(input, input.mode);
  await seedExercises();
  await save("profile", {
    id: PROFILE_ID,
    sex: input.sex,
    birthYear: new Date().getFullYear() - input.age,
    heightCm: input.heightCm,
    activity: input.activity,
    pace: "standard",
    mode: input.mode,
    proteinPerKg: MODE_PROTEIN[input.mode],
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
    reason: modeReason(input.mode, t),
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

// Which supplements you take. One transaction so quick taps all stick.
export async function toggleTakenSupplement(id: SupplementId) {
  await db.transaction("rw", db.profile, db.outbox, async () => {
    const p = await db.profile.get(PROFILE_ID);
    if (!p) return;
    const taken = takenOf(p);
    await save("profile", { ...p, supplements: taken.includes(id) ? taken.filter((x) => x !== id) : [...taken, id] });
  });
}

// Read and write in one transaction so quick taps on several days all stick.
export async function toggleTrainingDay(day: number) {
  await db.transaction("rw", db.profile, db.outbox, async () => {
    const p = await db.profile.get(PROFILE_ID);
    if (!p) return;
    const days = p.trainingDays ?? [];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
    await save("profile", { ...p, trainingDays: next });
  });
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
  if (food.source !== "curated" && food.source !== "indb") await ensureFood(food);
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
  const entry = await save("weights", { id: sameDay?.id ?? newId(), date, kg });
  await followWeightWithProtein();
  return entry;
}

const perKgOf = async () => perKgFor(await db.profile.get(PROFILE_ID));

// Protein is set per kg, so it follows your weight. The current target is
// updated in place (calories unchanged) so the two-week calorie clock isn't
// reset by a weigh-in.
export async function followWeightWithProtein(perKg?: number) {
  const current = await currentTarget();
  const latest = await latestWeight();
  if (!current || !latest) return;
  const factor = perKg ?? (await perKgOf());
  if (proteinFor(latest.kg, factor) === current.protein) return;
  const m = macrosFor(current.calories, latest.kg, factor);
  await save("targets", { ...current, protein: m.protein, carbs: m.carbs, fat: m.fat });
}

export async function setProteinPerKg(perKg: number) {
  await updateProfile({ proteinPerKg: perKg });
  await followWeightWithProtein(perKg);
}

// A fresh target from today using the goal's formula. Earlier targets and
// logged food are left as they were.
export async function recalculateTargets(): Promise<Target | undefined> {
  const profile = await db.profile.get(PROFILE_ID);
  const w = await latestWeight();
  if (!profile || !w) return;
  const mode = modeOf(profile);
  const t = modeTargets({ ...bodyOf(profile), weightKg: w.kg }, mode, perKgFor(profile));
  return save("targets", {
    id: newId(),
    date: dateKey(),
    calories: t.calories,
    protein: t.protein,
    carbs: t.carbs,
    fat: t.fat,
    source: "manual",
    reason: `${modeReason(mode, t)} At ${w.kg} kg.`,
  });
}

// Switching goal resets protein to that goal's default (you can change it
// after) and recalculates calories and macros.
export async function setGoalMode(mode: GoalMode) {
  await updateProfile({ mode, proteinPerKg: MODE_PROTEIN[mode] });
  return recalculateTargets();
}

export async function currentTarget(): Promise<Target | undefined> {
  const all = alive(await db.targets.toArray());
  return all.sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt).at(-1);
}

export async function setManualTarget(calories: number, latestKg: number, reason = "Set by you.") {
  const m = macrosFor(calories, latestKg, await perKgOf());
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
    mode: modeOf(profile),
    body: bodyOf(profile),
  });
  if (result.kind !== "change") return null;
  const latestKg = weights.sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.kg;
  const m = macrosFor(current.calories + result.delta, latestKg, perKgFor(profile));
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
  for (const t of SYNCED_TABLES) {
    out[t] = alive(await db.table(t).toArray());
  }
  return out;
}

// Merges a backup into this device. A row is only taken when it's newer
// than the copy already here, so importing twice is harmless.
export async function importBackup(data: unknown): Promise<number> {
  if (!data || typeof data !== "object" || (data as { version?: unknown }).version !== 1) {
    throw new Error("That file isn't a LiftLog backup.");
  }
  let count = 0;
  for (const t of SYNCED_TABLES) {
    const rows = (data as Record<string, unknown>)[t];
    if (!Array.isArray(rows)) continue;
    for (const row of rows as SyncFields[]) {
      if (!row || typeof row.id !== "string") continue;
      const local = (await db.table(t).get(row.id)) as SyncFields | undefined;
      if (local && (local.updatedAt ?? 0) >= (row.updatedAt ?? 0)) continue;
      await save(t, row as never);
      count++;
    }
  }
  return count;
}

// ---------- History ----------

// Re-reads every set of an exercise in date order and fixes PR flags, so
// edits and backfilled sessions never leave stale badges behind.
export async function recomputePrs(exerciseId: string) {
  const sets = alive(await db.sets.where("exerciseId").equals(exerciseId).toArray());
  const workouts = new Map(alive(await db.workouts.toArray()).map((w) => [w.id, w]));
  const ordered = sets
    .filter((s) => workouts.has(s.workoutId))
    .sort((a, b) => workouts.get(a.workoutId)!.startedAt - workouts.get(b.workoutId)!.startedAt || a.order - b.order);
  const flags = replayPrs(ordered);
  for (const s of ordered) {
    const pr = flags.get(s.id) ?? null;
    if (pr !== s.pr) await save("sets", { ...s, pr });
  }
}

const atLocalTime = (date: string, hour: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, hour).getTime();
};

// A session done on paper: dated in the past and already finished, so it
// never changes which day is next in the rotation.
export async function backfillWorkout(date: string, day: SplitDay | null) {
  const startedAt = atLocalTime(date, 18);
  return save("workouts", {
    id: newId(),
    splitDayId: day?.id ?? null,
    splitDayName: day?.name ?? "Workout",
    date,
    startedAt,
    finishedAt: startedAt + 3600_000,
    extraExerciseIds: day?.exercises.map((e) => e.exerciseId) ?? [],
  });
}

export async function addHistorySet(workout: Workout, exerciseId: string, weightKg: number, reps: number) {
  const count = alive(await db.sets.where("workoutId").equals(workout.id).toArray()).filter((s) => s.exerciseId === exerciseId).length;
  await save("sets", { id: newId(), workoutId: workout.id, exerciseId, order: count, weightKg, reps, loggedAt: Date.now(), pr: null });
  await recomputePrs(exerciseId);
}

export async function editHistorySet(set: WorkoutSet, weightKg: number, reps: number) {
  await save("sets", { ...set, weightKg, reps });
  await recomputePrs(set.exerciseId);
}

export async function deleteHistorySet(set: WorkoutSet) {
  await remove("sets", set.id);
  await recomputePrs(set.exerciseId);
}

export async function moveWorkout(workout: Workout, date: string) {
  const shift = atLocalTime(date, 0) - atLocalTime(workout.date, 0);
  await save("workouts", {
    ...workout,
    date,
    startedAt: workout.startedAt + shift,
    finishedAt: workout.finishedAt === null ? null : workout.finishedAt + shift,
  });
  const ids = new Set(alive(await db.sets.where("workoutId").equals(workout.id).toArray()).map((s) => s.exerciseId));
  for (const id of ids) await recomputePrs(id);
}

// Returns an undo function that brings the workout and its sets back.
export async function deleteWorkout(workout: Workout) {
  const sets = alive(await db.sets.where("workoutId").equals(workout.id).toArray());
  for (const s of sets) await remove("sets", s.id);
  await remove("workouts", workout.id);
  const exercises = new Set(sets.map((s) => s.exerciseId));
  for (const id of exercises) await recomputePrs(id);
  return async () => {
    await save("workouts", { ...workout, deletedAt: null });
    for (const s of sets) await save("sets", { ...s, deletedAt: null });
    for (const id of exercises) await recomputePrs(id);
  };
}

// ---------- Daily habits and copying meals ----------

export async function updateDay(date: string, patch: Partial<Pick<DayLog, "waterGlasses" | "creatine">>) {
  const current = await db.days.get(date);
  return save("days", { id: date, date, waterGlasses: 0, creatine: false, ...current, ...patch, deletedAt: null });
}

export async function saveSteps(date: string, steps: number) {
  return save("days", { id: stepsRecordId(date), date, waterGlasses: 0, creatine: false, steps, deletedAt: null });
}

// Ticks a supplement on or off for a day and returns an undo. Whey and mass
// gainer are logged as food so they count in the day's totals; unticking
// removes that day's entries for them.
export async function toggleSupplement(date: string, id: SupplementId): Promise<() => Promise<void>> {
  const foodId = SUPPLEMENTS.find((s) => s.id === id)?.foodId;
  if (foodId) {
    const logged = alive(await db.foodEntries.where("date").equals(date).toArray()).filter((e) => e.foodId === foodId);
    if (logged.length) {
      for (const e of logged) await remove("foodEntries", e.id);
      return async () => {
        for (const e of logged) await save("foodEntries", { ...e, deletedAt: null });
      };
    }
    const e = await logFood(CURATED_FOODS.find((f) => f.id === foodId)!, 1, mealForNow(), date);
    return () => remove("foodEntries", e.id);
  }
  // Read and write in one transaction so quick taps all stick.
  await db.transaction("rw", db.days, db.outbox, async () => {
    const current = await db.days.get(date);
    const row: Omit<DayLog, "updatedAt"> = { id: date, date, waterGlasses: 0, creatine: false, ...current, deletedAt: null };
    if (id === "creatine") row.creatine = !row.creatine;
    else {
      const list = row.supplements ?? [];
      row.supplements = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    }
    await save("days", row);
  });
  return async () => {
    await toggleSupplement(date, id);
  };
}

// Copies entries onto another day (optionally into one meal slot) and
// returns the new ids so the copy can be undone.
export async function copyEntries(entries: FoodEntry[], date: string, meal?: Meal) {
  const ids: string[] = [];
  for (const e of entries) {
    const copy = await save("foodEntries", { ...e, id: newId(), date, meal: meal ?? e.meal, loggedAt: Date.now(), deletedAt: null });
    ids.push(copy.id);
  }
  return ids;
}
