import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { dailyTotals, estimateMaintenance, setsPerMuscle, weekStreak, weeklyIntake } from "./progress-logic";
import type { FoodEntry } from "./types";

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
