import { describe, expect, it } from "vitest";
import type { SplitDay, Workout, WorkoutSet } from "./types";
import { detectPr, e1rm, formatSets, lastSessionSets, nextSplitDay, planProgression, replayPrs, suggestSet } from "./workout-logic";

const day = (id: string, order: number): SplitDay => ({ id, order, name: id, exercises: [], updatedAt: 0 });
const workout = (id: string, splitDayId: string, startedAt: number, finished = true): Workout => ({
  id,
  splitDayId,
  splitDayName: splitDayId,
  date: "2026-01-01",
  startedAt,
  finishedAt: finished ? startedAt + 1 : null,
  extraExerciseIds: [],
  updatedAt: 0,
});
const set = (workoutId: string, order: number, weightKg: number, reps: number, exerciseId = "bench"): WorkoutSet => ({
  id: `${workoutId}-${exerciseId}-${order}`,
  workoutId,
  exerciseId,
  order,
  weightKg,
  reps,
  loggedAt: 0,
  pr: null,
  updatedAt: 0,
});

describe("rotation", () => {
  const days = [day("push", 0), day("pull", 1), day("legs", 2)];

  it("starts at the first day", () => {
    expect(nextSplitDay(days, [])?.id).toBe("push");
  });

  it("follows the last finished workout, whatever the date", () => {
    expect(nextSplitDay(days, [workout("a", "push", 1), workout("b", "pull", 2)])?.id).toBe("legs");
  });

  it("wraps around", () => {
    expect(nextSplitDay(days, [workout("a", "legs", 5)])?.id).toBe("push");
  });

  it("ignores unfinished workouts", () => {
    expect(nextSplitDay(days, [workout("a", "push", 1), workout("b", "pull", 2, false)])?.id).toBe("pull");
  });
});

describe("PRs", () => {
  const history = [set("w1", 0, 70, 8), set("w1", 1, 70, 7)];

  it("is not a PR without history", () => {
    expect(detectPr({ weightKg: 100, reps: 5 }, [])).toBeNull();
  });

  it("flags heavier weight", () => {
    expect(detectPr({ weightKg: 72.5, reps: 5 }, history)).toBe("weight");
  });

  it("flags more reps at the same weight via e1RM", () => {
    expect(detectPr({ weightKg: 70, reps: 10 }, history)).toBe("e1rm");
  });

  it("does not flag a repeat", () => {
    expect(detectPr({ weightKg: 70, reps: 8 }, history)).toBeNull();
  });

  it("e1RM of a single is the weight", () => {
    expect(e1rm(100, 1)).toBe(100);
  });
});

describe("last time and suggestions", () => {
  const workouts = [workout("w1", "push", 1), workout("w2", "push", 2), workout("w3", "push", 3, false)];
  const sets = [set("w1", 0, 60, 8), set("w2", 0, 70, 8), set("w2", 1, 70, 7), set("w3", 0, 72.5, 8)];

  it("finds the most recent earlier session", () => {
    expect(lastSessionSets("bench", "w3", workouts, sets).map((s) => s.weightKg)).toEqual([70, 70]);
  });

  it("keeps this session's weight and uses today's target reps", () => {
    expect(suggestSet(1, [sets[3]], { weightKg: 70, reps: [9, 8, 8] }, 6)).toEqual({ weightKg: 72.5, reps: 8 });
  });

  it("starts from the target when nothing is logged yet", () => {
    expect(suggestSet(0, [], { weightKg: 70, reps: [9, 8, 8] }, 6)).toEqual({ weightKg: 70, reps: 9 });
  });

  it("has no weight to suggest for a brand-new exercise", () => {
    expect(suggestSet(0, [], null, 6)).toEqual({ weightKg: 0, reps: 6 });
  });

  it("formats sets compactly", () => {
    expect(formatSets([sets[1], sets[2]])).toBe("70 kg × 8, 7");
  });
});

describe("progression", () => {
  const plan = { sets: 3, repMin: 6, repMax: 10 };
  const s = (weightKg: number, ...reps: number[]) => reps.map((r) => ({ weightKg, reps: r }));

  it("adds weight once every set hits the top of the range", () => {
    const p = planProgression("bench-press", plan, [s(60, 10, 10, 10)])!;
    expect(p).toMatchObject({ kind: "increase", weightKg: 62.5, reps: [6, 6, 6] });
  });

  it("uses 5 kg steps for big lower-body lifts", () => {
    expect(planProgression("squat", plan, [s(80, 10, 10, 10)])!.weightKg).toBe(85);
  });

  it("otherwise asks for one more rep at the same weight", () => {
    expect(planProgression("bench-press", plan, [s(60, 8, 8, 7)])).toMatchObject({ kind: "reps", weightKg: 60, reps: [9, 9, 8] });
  });

  it("does not add weight when only some sets hit the top", () => {
    expect(planProgression("bench-press", plan, [s(60, 10, 10, 9)])!.kind).toBe("reps");
  });

  it("deloads about 10% after three stuck sessions", () => {
    const p = planProgression("bench-press", plan, [s(70, 7, 6, 6), s(70, 7, 7, 6), s(70, 8, 7, 6)])!;
    expect(p).toMatchObject({ kind: "deload", weightKg: 62.5 });
  });

  it("does not deload while reps are still climbing", () => {
    expect(planProgression("bench-press", plan, [s(70, 8, 7, 7), s(70, 7, 7, 6), s(70, 7, 6, 6)])!.kind).toBe("reps");
  });

  it("has nothing to suggest without history", () => {
    expect(planProgression("bench-press", plan, [])).toBeNull();
  });
});

describe("PR replay", () => {
  it("treats the first session as a baseline and flags later bests", () => {
    const ordered = [set("w1", 0, 60, 8), set("w1", 1, 65, 5), set("w2", 0, 62.5, 8), set("w2", 1, 70, 3)];
    const flags = replayPrs(ordered);
    expect(flags.get(ordered[0].id)).toBeNull();
    expect(flags.get(ordered[1].id)).toBeNull();
    expect(flags.get(ordered[2].id)).toBe("e1rm");
    expect(flags.get(ordered[3].id)).toBe("weight");
  });
});
