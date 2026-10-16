import { describe, expect, it } from "vitest";
import type { SplitDay, Workout, WorkoutSet } from "./types";
import { detectPr, e1rm, formatSets, lastSessionSets, nextSplitDay, suggestSet } from "./workout-logic";

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

  it("repeats this session's previous set first", () => {
    expect(suggestSet(1, [sets[3]], [sets[1], sets[2]], 6)).toEqual({ weightKg: 72.5, reps: 8 });
  });

  it("falls back to the matching set from last time", () => {
    expect(suggestSet(1, [], [sets[1], sets[2]], 6)).toEqual({ weightKg: 70, reps: 7 });
  });

  it("formats sets compactly", () => {
    expect(formatSets([sets[1], sets[2]])).toBe("70 kg × 8, 7");
  });
});
