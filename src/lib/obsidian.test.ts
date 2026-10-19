import { describe, expect, it } from "vitest";
import { dailyLogMarkdown, obsidianUri, type DayInput } from "./obsidian";
import type { FoodEntry, Target, Workout, WorkoutSet } from "./types";

const DATE = "2026-10-17";
const workout = (id: string, name: string, startedAt: number, finishedAt: number | null, date = DATE): Workout => ({
  id,
  splitDayId: null,
  splitDayName: name,
  date,
  startedAt,
  finishedAt,
  extraExerciseIds: [],
  updatedAt: 0,
});
let seq = 0;
const set = (workoutId: string, exerciseId: string, weightKg: number, reps: number, pr: WorkoutSet["pr"] = null): WorkoutSet => ({
  id: `s${++seq}`,
  workoutId,
  exerciseId,
  order: seq,
  weightKg,
  reps,
  loggedAt: seq,
  pr,
  updatedAt: 0,
});
const entry = (kcal: number, protein: number, servings = 1, date = DATE): FoodEntry => ({
  id: `e${++seq}`,
  date,
  meal: "lunch",
  foodId: "f",
  name: "food",
  serving: "1",
  servings,
  kcal,
  protein,
  carbs: 0,
  fat: 0,
  loggedAt: 0,
  updatedAt: 0,
});
const target = (date: string, calories: number, protein: number): Target => ({
  id: `t${date}`,
  date,
  calories,
  protein,
  carbs: 0,
  fat: 0,
  source: "initial",
  reason: "",
  updatedAt: 0,
});
const names = new Map([
  ["bench", "Bench press"],
  ["ohp", "Overhead press"],
  ["dip", "Dips"],
]);
const base = (over: Partial<DayInput> = {}): DayInput => ({
  date: DATE,
  workouts: [],
  sets: [],
  exerciseNames: names,
  entries: [],
  targets: [],
  ...over,
});

describe("dailyLogMarkdown", () => {
  it("writes the Daily Log's Training and Nutrition sections", () => {
    const md = dailyLogMarkdown(
      base({
        workouts: [workout("w1", "Push A", 0, 52 * 60_000), workout("old", "Legs", 0, 1, "2026-10-16")],
        sets: [
          set("w1", "bench", 75, 8),
          set("w1", "bench", 80, 6, "weight"),
          set("w1", "bench", 80, 5),
          set("w1", "ohp", 45, 8),
          set("w1", "dip", 0, 10),
          set("w1", "dip", 0, 12),
          set("old", "bench", 200, 1),
        ],
        entries: [entry(500, 40, 2), entry(1300.4, 61.6), entry(9999, 999, 1, "2026-10-16")],
        targets: [target("2026-10-01", 2600, 160), target("2026-10-20", 3000, 200)],
      }),
    );
    expect(md).toBe(
      [
        "## Training",
        "- Day / split: Push A (52 min)",
        "- Top sets: Bench press 80 kg × 6 · Overhead press 45 kg × 8 · Dips BW × 12",
        "- PRs: Bench press 80 kg × 6",
        "",
        "## Nutrition",
        "- Protein: 142 / 160 g (89%)",
        "- Calories: 2300 / 2600 kcal (88%)",
        "",
      ].join("\n"),
    );
  });

  it("marks a rest day and unlogged food", () => {
    const md = dailyLogMarkdown(base({ targets: [target("2026-10-01", 2600, 160)] }));
    expect(md).toContain("- Day / split: Rest day");
    expect(md).toContain("- Top sets: None");
    expect(md).toContain("- PRs: None");
    expect(md).toContain("- Protein: not logged / 160 g");
    expect(md).toContain("- Calories: not logged / 2600 kcal");
  });

  it("skips empty and deleted workouts, and joins two sessions", () => {
    const md = dailyLogMarkdown(
      base({
        workouts: [
          workout("a", "Push", 0, 30 * 60_000),
          workout("b", "Arms", 100, null),
          workout("c", "Empty", 50, 60),
          { ...workout("d", "Deleted", 10, 20), deletedAt: 1 },
        ],
        sets: [set("a", "bench", 60, 10), set("b", "dip", 10, 8), set("d", "ohp", 40, 5)],
      }),
    );
    expect(md).toContain("- Day / split: Push (30 min) + Arms\n");
    expect(md).not.toContain("Overhead");
    expect(md).toContain("- Protein: not logged\n");
  });

  it("names a session even when no sets were logged", () => {
    const md = dailyLogMarkdown(base({ workouts: [workout("p", "Pull", 0, 20 * 60_000)] }));
    expect(md).toContain("- Day / split: Pull (20 min)\n- Top sets: None\n");
  });

  it("prefers the day's adjusted target over the base one", () => {
    const md = dailyLogMarkdown(base({ entries: [entry(1745, 70)], targets: [target("2026-10-01", 2850, 140)], dayTarget: { calories: 3490, protein: 140 } }));
    expect(md).toContain("- Protein: 70 / 140 g (50%)\n- Calories: 1745 / 3490 kcal (50%)");
  });

  it("works without a target", () => {
    expect(dailyLogMarkdown(base({ entries: [entry(400, 30)] }))).toContain("- Calories: 400 kcal\n");
  });
});

describe("obsidianUri", () => {
  it("appends to the dated note in the Journal folder with every value encoded", () => {
    const content = "## Training\n- Top sets: Bench 80 kg × 6 & more #pr?";
    const uri = obsidianUri(DATE, content);
    expect(uri.startsWith("obsidian://new?vault=LiftLog&file=Journal%2F2026-10-17&content=")).toBe(true);
    expect(uri.endsWith("&append=true")).toBe(true);
    expect(uri.slice("obsidian://new?".length)).not.toMatch(/[ \n#?/×]/);
    const params = new URLSearchParams(uri.slice("obsidian://new?".length));
    expect(params.get("file")).toBe("Journal/2026-10-17");
    expect(params.get("content")).toBe(`\n${content}`);
    expect(uri).toContain("%20");
    expect(uri).not.toContain("+");
  });

  it("takes a custom vault and folder", () => {
    expect(obsidianUri(DATE, "x", "My Vault", "Daily/Logs")).toBe("obsidian://new?vault=My%20Vault&file=Daily%2FLogs%2F2026-10-17&content=%0Ax&append=true");
  });
});
