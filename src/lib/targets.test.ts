import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { bmr, initialTargets, planAdjustment, targetWeeklyGainKg, weeklyTrendKg } from "./targets";
import type { Target } from "./types";

const stats = { sex: "male" as const, age: 25, heightCm: 175, weightKg: 70, activity: "moderate" as const, pace: "standard" as const };

const target = (date: string, calories = 2700): Target => ({
  id: "t",
  updatedAt: 0,
  date,
  calories,
  protein: 140,
  carbs: 300,
  fat: 75,
  source: "initial",
  reason: "",
});

// Weigh-ins every other day for `days`, changing by `perWeek` kg a week.
const series = (start: string, days: number, startKg: number, perWeek: number) =>
  Array.from({ length: Math.floor(days / 2) + 1 }, (_, i) => ({
    date: addDays(start, i * 2),
    kg: startKg + (perWeek / 7) * i * 2,
  }));

const everyDay = (start: string, n: number) => Array.from({ length: n }, (_, i) => addDays(start, i));

describe("initial targets", () => {
  it("uses Mifflin–St Jeor", () => {
    expect(bmr(stats)).toBeCloseTo(10 * 70 + 6.25 * 175 - 5 * 25 + 5);
  });

  it("adds a small surplus and 2 g/kg protein", () => {
    const t = initialTargets(stats);
    const maintenance = bmr(stats) * 1.55;
    expect(t.calories).toBeGreaterThan(maintenance);
    expect(t.calories - maintenance).toBeLessThan(300);
    expect(t.calories % 50).toBe(0);
    expect(t.protein).toBe(140);
    expect(t.protein * 4 + t.carbs * 4 + t.fat * 9).toBeGreaterThan(t.calories - 40);
  });

  it("standard pace is about 1% of body weight a month", () => {
    expect(targetWeeklyGainKg(70, "standard") * 52 / 12).toBeCloseTo(0.7, 2);
  });
});

describe("weekly trend", () => {
  it("fits a slope through noisy points", () => {
    const pts = series("2026-01-01", 14, 70, 0.3).map((p, i) => ({ ...p, kg: p.kg + (i % 2 ? 0.3 : -0.3) }));
    expect(weeklyTrendKg(pts)!).toBeCloseTo(0.3, 0);
  });
});

describe("auto adjust", () => {
  const start = "2026-01-01";
  const today = addDays(start, 14);

  it("waits two weeks after a change", () => {
    const r = planAdjustment({ today: addDays(start, 10), current: target(start), weights: series(start, 10, 70, 0), loggedFoodDays: everyDay(start, 10), pace: "standard" });
    expect(r.kind).toBe("wait");
  });

  it("waits when food wasn't logged enough", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0), loggedFoodDays: everyDay(start, 5), pace: "standard" });
    expect(r.kind).toBe("wait");
  });

  it("raises calories when weight is flat", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0), loggedFoodDays: everyDay(start, 14), pace: "standard" });
    expect(r.kind).toBe("change");
    if (r.kind === "change") {
      expect(r.delta).toBeGreaterThanOrEqual(100);
      expect(r.delta).toBeLessThanOrEqual(150);
    }
  });

  it("lowers calories when gaining too fast", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0.8), loggedFoodDays: everyDay(start, 14), pace: "standard" });
    expect(r.kind).toBe("change");
    if (r.kind === "change") expect(r.delta).toBeLessThanOrEqual(-100);
  });

  it("leaves calories alone when on pace", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0.16), loggedFoodDays: everyDay(start, 14), pace: "standard" });
    expect(r.kind).toBe("on_pace");
  });
});
