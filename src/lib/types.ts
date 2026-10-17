// Every synced record carries these fields so devices can merge changes
// (last write wins on updatedAt). deletedAt marks a soft delete.
export interface SyncFields {
  id: string;
  updatedAt: number;
  deletedAt?: number | null;
}

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GainPace = "slow" | "standard" | "fast";
export type GoalMode = "bulk" | "cut" | "recomp" | "maintenance";
export type Meal = "breakfast" | "lunch" | "snack" | "dinner";

export interface Profile extends SyncFields {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  activity: Activity;
  pace: GainPace; // no longer used: calories follow `mode`
  mode?: GoalMode; // unset means bulk
  autoAdjust: boolean;
  restSeconds: number;
  onboarded: boolean;
  waterGoal?: number; // glasses of 250 ml
  proteinPerKg?: number; // grams of protein per kg of body weight
  diet?: "veg" | "egg" | "nonveg";
  trainingDays?: number[]; // planned weekdays, 0 = Sunday
  workoutCalories?: boolean; // add estimated workout calories to the day's target
  supplements?: SupplementId[]; // the ones you take; unset means whey and creatine
}

export type SupplementId = "whey" | "mass-gainer" | "creatine" | "multivitamin" | "fish-oil" | "pre-workout";

export interface Target extends SyncFields {
  date: string; // YYYY-MM-DD the target took effect
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "initial" | "auto" | "manual";
  reason: string;
}

export interface Exercise extends SyncFields {
  name: string;
  muscle: string;
  custom: boolean;
}

export interface PlannedExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
}

export interface SplitDay extends SyncFields {
  name: string;
  order: number;
  exercises: PlannedExercise[];
}

export interface Workout extends SyncFields {
  splitDayId: string | null;
  splitDayName: string;
  date: string;
  startedAt: number;
  finishedAt: number | null;
  // Exercises added on the fly during this session, on top of the split day.
  extraExerciseIds: string[];
}

export interface WorkoutSet extends SyncFields {
  workoutId: string;
  exerciseId: string;
  order: number;
  weightKg: number;
  reps: number;
  loggedAt: number;
  pr: PrKind | null;
}

export type PrKind = "weight" | "e1rm";

export type FoodSource = "curated" | "indb" | "off" | "user";

// Nutrition values are per one serving.
export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Food extends SyncFields, Macros {
  name: string;
  serving: string;
  servingGrams: number | null;
  source: FoodSource;
  barcode?: string | null;
  brand?: string | null;
  // Set for home recipes: the ingredients for the whole pot and how many
  // servings it makes. The macros above are per serving.
  recipe?: { servings: number; items: SavedMealItem[] } | null;
}

export interface FoodEntry extends SyncFields, Macros {
  date: string;
  meal: Meal;
  foodId: string;
  name: string;
  serving: string;
  servings: number;
  loggedAt: number;
}

export interface SavedMealItem extends Macros {
  foodId: string;
  name: string;
  serving: string;
  servings: number;
}

export interface SavedMeal extends SyncFields {
  name: string;
  items: SavedMealItem[];
}

export interface WeightEntry extends SyncFields {
  date: string;
  kg: number;
}

export type SyncedTable =
  | "profile"
  | "targets"
  | "exercises"
  | "splitDays"
  | "workouts"
  | "sets"
  | "foods"
  | "foodEntries"
  | "savedMeals"
  | "weights"
  | "days";

// One row per calendar day (id = YYYY-MM-DD) for quick daily habits.
export interface DayLog extends SyncFields {
  date: string;
  waterGlasses: number;
  creatine: boolean;
  // Ticked-off pills. Creatine stays in `creatine`; whey and mass gainer
  // are logged as food instead.
  supplements?: SupplementId[];
}

export interface OutboxItem {
  seq?: number;
  table: SyncedTable;
  rowId: string;
}
