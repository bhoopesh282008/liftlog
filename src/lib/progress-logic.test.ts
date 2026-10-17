import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { adherence, dailyTotals, estimateMaintenance, setsPerMuscle, sharedWeeks, weekStreak, weeklyBestE1rm, weeklyIntake } from "./progress-logic";
import type { FoodEntry, Target } from "./types";

const entry = (date: string, kcal: number, protein = 0): FoodEntry => ({
  id: `${date}-${kcal}`,
  date,
  meal: "lunch",
  foodId: "x",
  name: "x",
  serving: "1",
  servings: 1,
  kcal,
  protein,
  carbs: 0,
  fat: 0,
  loggedAt: 0,
  updatedAt: 0,
});

describe("week streak", () => {
  const today = "2026-10-16"; // a Friday

  it("counts consecutive weeks with 2+ workouts", () => {
    const dates = ["2026-10-13", "2026-10-15", "2026-10-06", "2026-10-08", "2026-09-29", "2026-10-01"];
    expect(weekStreak(dates, today)).toBe(3);
  });

  it("doesn't break on a week that hasn't qualified yet", () => {
    expect(weekStreak(["2026-10-13", "2026-10-06", "2026-10-08", "2026-09-29", "2026-10-01"], today)).toBe(2);
  });

  it("stops at a missed week", () => {
    expect(weekStreak(["2026-10-13", "2026-10-15", "2026-09-29", "2026-10-01"], today)).toBe(1);
  });
});

describe("sets per muscle", () => {
  it("counts sets inside the date range only", () => {
    const workouts = [
      { id: "a", date: "2026-10-14" },
      { id: "b", date: "2026-10-01" },
    ];
    const sets = [
      { workoutId: "a", exerciseId: "bench-press" },
      { workoutId: "a", exerciseId: "bench-press" },
      { workoutId: "a", exerciseId: "squat" },
      { workoutId: "b", exerciseId: "bench-press" },
    ];
    const m = setsPerMuscle(sets, workouts, new Map([["bench-press", "Chest"], ["squat", "Legs"]]), "2026-10-10", "2026-10-16");
    expect(m.get("Chest")).toBe(2);
    expect(m.get("Legs")).toBe(1);
  });
});

describe("intake", () => {
  const today = "2026-10-21";
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, -i));

  it("averages only logged days per week", () => {
    const totals = dailyTotals([entry("2026-10-13", 2000), entry("2026-10-14", 3000), entry("2026-10-14", 0)]);
    expect(weeklyIntake(totals, "2026-10-01", today)).toEqual([{ date: "2026-10-12", kcal: 2500, protein: 0, days: 2 }]);
  });

  it("estimates maintenance from intake and weight change", () => {
    const totals = dailyTotals(days.map((d) => entry(d, 2800)));
    // Gaining 0.35 kg/week means ~385 kcal/day surplus.
    const weights = days.filter((_, i) => i % 3 === 0).map((d) => ({ date: d, kg: 70 + (0.35 / 7) * -(days.indexOf(d)) }));
    const m = estimateMaintenance(totals, weights, today)!;
    expect(m.intake).toBe(2800);
    expect(m.kcal).toBeGreaterThanOrEqual(2350);
    expect(m.kcal).toBeLessThanOrEqual(2450);
  });

  it("needs enough logged days", () => {
    const totals = dailyTotals(days.slice(0, 5).map((d) => entry(d, 2800)));
    expect(estimateMaintenance(totals, days.map((d) => ({ date: d, kg: 70 })), today)).toBeNull();
  });
});

describe("adherence", () => {
  const t: Target = { id: "t", date: "2026-10-01", calories: 2000, protein: 140, carbs: 250, fat: 60, source: "initial", reason: "", updatedAt: 0 };
  const days = ["2026-10-13", "2026-10-14"];
  const entries = [entry("2026-10-13", 2150, 140), entry("2026-10-14", 1900, 100)];

  it("counts protein goal days at 95% and calories within 10%", () => {
    const week = adherence(days, entries, [t]);
    expect(week.map((d) => d.proteinHit)).toEqual([true, false]);
    expect(week.map((d) => d.caloriesHit)).toEqual([true, true]);
  });

  it("judges calories against the day's own goal", () => {
    // A rest day at 1,700: 2,150 is now well over.
    const week = adherence(days, entries, [t], (date, base) => (date === "2026-10-13" ? 1700 : base.calories));
    expect(week.map((d) => d.caloriesHit)).toEqual([false, true]);
  });
});

describe("trends side by side", () => {
  const workouts = [
    { id: "a", date: "2026-10-05" },
    { id: "b", date: "2026-10-07" },
    { id: "c", date: "2026-10-13" },
  ];
  const sets = [
    { workoutId: "a", exerciseId: "bench", weightKg: 60, reps: 5 },
    { workoutId: "b", exerciseId: "bench", weightKg: 62.5, reps: 5 },
    { workoutId: "b", exerciseId: "squat", weightKg: 100, reps: 5 },
    { workoutId: "c", exerciseId: "bench", weightKg: 60, reps: 8 },
  ];

  it("keeps the best e1RM of each week for one lift", () => {
    expect(weeklyBestE1rm("bench", workouts, sets)).toEqual([
      { date: "2026-10-05", value: 72.9 },
      { date: "2026-10-12", value: 76 },
    ]);
  });

  it("cuts two series to the weeks both have", () => {
    const a = [{ date: "w1", value: 1 }, { date: "w2", value: 2 }, { date: "w3", value: 3 }];
    const b = [{ date: "w2", value: 20 }, { date: "w3", value: 30 }, { date: "w4", value: 40 }];
    expect(sharedWeeks(a, b)).toEqual({ a: a.slice(1), b: b.slice(0, 2) });
  });
});
