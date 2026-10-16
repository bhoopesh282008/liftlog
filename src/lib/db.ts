import Dexie, { type EntityTable } from "dexie";
import type {
  DayLog,
  Exercise,
  Food,
  FoodEntry,
  OutboxItem,
  Profile,
  SavedMeal,
  SplitDay,
  SyncedTable,
  Target,
  WeightEntry,
  Workout,
  WorkoutSet,
} from "./types";

export interface MetaRow {
  key: string;
  value: unknown;
}

// The device keeps a full copy of the user's data so logging works with no
// signal. When sync is set up, changes queued in `outbox` are pushed later.
export class TrackerDB extends Dexie {
  profile!: EntityTable<Profile, "id">;
  targets!: EntityTable<Target, "id">;
  exercises!: EntityTable<Exercise, "id">;
  splitDays!: EntityTable<SplitDay, "id">;
  workouts!: EntityTable<Workout, "id">;
  sets!: EntityTable<WorkoutSet, "id">;
  foods!: EntityTable<Food, "id">;
  foodEntries!: EntityTable<FoodEntry, "id">;
  savedMeals!: EntityTable<SavedMeal, "id">;
  weights!: EntityTable<WeightEntry, "id">;
  days!: EntityTable<DayLog, "id">;
  outbox!: EntityTable<OutboxItem, "seq">;
  meta!: EntityTable<MetaRow, "key">;

  constructor(name = "lift-log") {
    super(name);
    this.version(1).stores({
      profile: "id",
      targets: "id, date",
      exercises: "id, name",
      splitDays: "id, order",
      workouts: "id, startedAt, finishedAt, date",
      sets: "id, workoutId, exerciseId",
      foods: "id, name, barcode, source",
      foodEntries: "id, date, foodId, loggedAt",
      savedMeals: "id",
      weights: "id, date",
      outbox: "++seq, table, rowId",
      meta: "key",
    });
    this.version(2).stores({ days: "id, date" });
  }
}

export const db = new TrackerDB();

export const SYNCED_TABLES: SyncedTable[] = [
  "profile",
  "targets",
  "exercises",
  "splitDays",
  "workouts",
  "sets",
  "foods",
  "foodEntries",
  "savedMeals",
  "weights",
  "days",
];

export const PROFILE_ID = "me";

export const alive = <T extends { deletedAt?: number | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt);
