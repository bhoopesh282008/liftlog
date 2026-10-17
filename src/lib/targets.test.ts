import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { bmr, formatAdjust, maintenanceCalories, modeFormula, modeTargets, modeWeeklyChangeKg, planAdjustment, weeklyTrendKg } from "./targets";
import type { Target } from "./types";

const body = { sex: "male" as const, age: 25, heightCm: 175, activity: "moderate" as const };
const stats = { ...body, weightKg: 70 };

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

describe("goal targets", () => {
  it("uses Mifflin–St Jeor", () => {
    expect(bmr(stats)).toBeCloseTo(10 * 70 + 6.25 * 175 - 5 * 25 + 5);
  });

  it("moves maintenance by each goal's percentage, rounded to 50", () => {
    const m = maintenanceCalories(stats);
    expect(modeTargets(stats, "bulk").calories).toBe(Math.round((m * 1.1) / 50) * 50);
    expect(modeTargets(stats, "cut").calories).toBe(Math.round((m * 0.8) / 50) * 50);
    expect(modeTargets(stats, "recomp").calories).toBe(Math.round((m * 0.95) / 50) * 50);
    expect(modeTargets(stats, "maintenance").calories).toBe(Math.round(m / 50) * 50);
    expect(modeTargets(stats, "cut").maintenance).toBe(Math.round(m));
  });

  it("puts cut and recomp at the top of the protein range", () => {
    expect(modeTargets(stats, "cut").protein).toBe(155);
    expect(modeTargets(stats, "recomp").protein).toBe(155);
    expect(modeTargets(stats, "bulk").protein).toBe(140);
    expect(modeTargets(stats, "maintenance").protein).toBe(125);
    expect(modeTargets(stats, "bulk", 1.6).protein).toBe(110);
  });

  it("splits the calories into macros that add back up", () => {
    for (const mode of ["bulk", "cut", "recomp", "maintenance"] as const) {
      const t = modeTargets(stats, mode);
      expect(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.calories)).toBeLessThan(40);
    }
  });

  it("plans a gain for bulk, a loss for cut and recomp, nothing for maintenance", () => {
    expect(modeWeeklyChangeKg(stats, "bulk")).toBeCloseTo(0.24, 2);
    expect(modeWeeklyChangeKg(stats, "cut")).toBeCloseTo(-0.47, 2);
    expect(modeWeeklyChangeKg(stats, "recomp")).toBeCloseTo(-0.12, 2);
    expect(modeWeeklyChangeKg(stats, "maintenance")).toBe(0);
  });

  it("shows the working", () => {
    expect(formatAdjust("bulk")).toBe("+10%");
    expect(formatAdjust("cut")).toBe("−20%");
    expect(formatAdjust("maintenance")).toBe("±0%");
    const lines = modeFormula(stats, "cut");
    expect(lines[0]).toContain("Mifflin–St Jeor");
    expect(lines[1]).toContain(`−20% = ${modeTargets(stats, "cut").calories.toLocaleString("en-IN")} kcal`);
    expect(lines[2]).toContain("2.2 g × 70 kg = 155 g");
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
    const r = planAdjustment({ today: addDays(start, 10), current: target(start), weights: series(start, 10, 70, 0), loggedFoodDays: everyDay(start, 10), mode: "bulk", body });
    expect(r.kind).toBe("wait");
  });

  it("waits when food wasn't logged enough", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0), loggedFoodDays: everyDay(start, 5), mode: "bulk", body });
    expect(r.kind).toBe("wait");
  });

  it("raises calories when weight is flat", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0), loggedFoodDays: everyDay(start, 14), mode: "bulk", body });
    expect(r.kind).toBe("change");
    if (r.kind === "change") {
      expect(r.delta).toBeGreaterThanOrEqual(100);
      expect(r.delta).toBeLessThanOrEqual(150);
    }
  });

  it("lowers calories when gaining too fast", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0.8), loggedFoodDays: everyDay(start, 14), mode: "bulk", body });
    expect(r.kind).toBe("change");
    if (r.kind === "change") expect(r.delta).toBeLessThanOrEqual(-100);
  });

  it("leaves calories alone when on pace", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0.16), loggedFoodDays: everyDay(start, 14), mode: "bulk", body });
    expect(r.kind).toBe("on_pace");
  });
  it("expects loss on a cut: on plan when losing at the planned rate", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, -0.47), loggedFoodDays: everyDay(start, 14), mode: "cut", body });
    expect(r.kind).toBe("on_pace");
  });

  it("lowers calories on a cut when weight holds steady", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0), loggedFoodDays: everyDay(start, 14), mode: "cut", body });
    expect(r.kind).toBe("change");
    if (r.kind === "change") {
      expect(r.delta).toBeLessThanOrEqual(-100);
      expect(r.reason).toContain("cut plan");
    }
  });

  it("raises calories on a cut when losing much faster than planned", () => {
    const r = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, -1.2), loggedFoodDays: everyDay(start, 14), mode: "cut", body });
    expect(r.kind).toBe("change");
    if (r.kind === "change") expect(r.delta).toBeGreaterThanOrEqual(100);
  });

  it("expects no change on maintenance", () => {
    const flat = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0), loggedFoodDays: everyDay(start, 14), mode: "maintenance", body });
    expect(flat.kind).toBe("on_pace");
    const gaining = planAdjustment({ today, current: target(start), weights: series(start, 14, 70, 0.4), loggedFoodDays: everyDay(start, 14), mode: "maintenance", body });
    expect(gaining.kind).toBe("change");
    if (gaining.kind === "change") expect(gaining.delta).toBeLessThan(0);
  });
});
