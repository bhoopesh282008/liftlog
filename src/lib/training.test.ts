import { describe, expect, it } from "vitest";
import { builtinFoods } from "./data/food-sources";
import { POST_WORKOUT, PRE_WORKOUT, quickAddFoods } from "./protein";
import { dayTarget, isTrainingDay, waterGoalGlasses, workoutKcal, workoutPhase } from "./training";

const base = { calories: 2850, protein: 140, carbs: 395, fat: 80 };
const H = 3600_000;

describe("training days", () => {
  // 2026-10-19 is a Monday.
  it("counts a logged workout or a planned weekday", () => {
    expect(isTrainingDay("2026-10-19", new Set(), [1, 3, 5])).toBe(true);
    expect(isTrainingDay("2026-10-20", new Set(), [1, 3, 5])).toBe(false);
    expect(isTrainingDay("2026-10-20", new Set(["2026-10-20"]), [1, 3, 5])).toBe(true);
    expect(isTrainingDay("2026-10-20", new Set(), undefined)).toBe(false);
  });
});

describe("day targets", () => {
  it("moves carbs onto training days and keeps the week's total", () => {
    for (const n of [1, 3, 4, 5, 6]) {
      const train = dayTarget(base, { training: true, plannedPerWeek: n });
      const rest = dayTarget(base, { training: false, plannedPerWeek: n });
      expect(train.calories).toBeGreaterThan(base.calories);
      expect(rest.calories).toBeLessThan(base.calories);
      expect(Math.abs(n * train.calories + (7 - n) * rest.calories - 7 * base.calories)).toBeLessThanOrEqual(35);
    }
  });

  it("changes only carbs", () => {
    const t = dayTarget(base, { training: true, plannedPerWeek: 4 });
    expect(t.shift).toBe(290);
    expect(t.carbs).toBe(Math.round((395 + 290 / 4) / 5) * 5);
    expect(t.protein).toBe(140);
    expect(t.fat).toBe(80);
  });

  it("leaves the base alone with no plan or training every day", () => {
    expect(dayTarget(base, { training: true, plannedPerWeek: 0 }).calories).toBe(2850);
    expect(dayTarget(base, { training: false, plannedPerWeek: 7 }).calories).toBe(2850);
  });

  it("adds estimated workout calories as carbs", () => {
    const t = dayTarget(base, { training: true, plannedPerWeek: 0, extraKcal: 350 });
    expect(t.calories).toBe(3200);
    expect(t.workoutKcal).toBe(350);
    expect(t.carbs).toBe(Math.round((395 + 350 / 4) / 5) * 5);
  });
});

describe("workout calories", () => {
  it("is MET × kg × hours", () => {
    expect(workoutKcal([{ startedAt: 0, finishedAt: H }], 70)).toBe(350);
    expect(workoutKcal([{ startedAt: 0, finishedAt: 0.5 * H }], 80, 6)).toBe(240);
  });

  it("skips unfinished workouts and caps long ones at 3 hours", () => {
    expect(workoutKcal([{ startedAt: 0, finishedAt: null }], 70)).toBe(0);
    expect(workoutKcal([{ startedAt: 0, finishedAt: 10 * H }], 70)).toBe(1050);
  });
});

describe("water", () => {
  it("is 35 ml/kg plus 500 ml on training days, in 250 ml glasses", () => {
    expect(waterGoalGlasses(70, false)).toBe(10);
    expect(waterGoalGlasses(70, true)).toBe(12);
    expect(waterGoalGlasses(82, false)).toBe(12);
  });
});

describe("workout cards", () => {
  const now = 20 * H;
  it("shows pre on a planned day before training", () => {
    expect(workoutPhase(now, [], true)).toBe("pre");
    expect(workoutPhase(now, [], false)).toBeNull();
  });

  it("shows post during and for 3 hours after a workout", () => {
    expect(workoutPhase(now, [{ startedAt: now - H, finishedAt: null }], true)).toBe("post");
    expect(workoutPhase(now, [{ startedAt: now - 3 * H, finishedAt: now - 2 * H }], false)).toBe("post");
    expect(workoutPhase(now, [{ startedAt: now - 5 * H, finishedAt: now - 4 * H }], true)).toBeNull();
    expect(workoutPhase(now, [{ startedAt: now + H, finishedAt: now + 2 * H }], true)).toBeNull();
  });

  it("finds every suggested food", () => {
    expect(quickAddFoods(builtinFoods(), undefined, PRE_WORKOUT)).toHaveLength(PRE_WORKOUT.length);
    expect(quickAddFoods(builtinFoods(), undefined, POST_WORKOUT)).toHaveLength(POST_WORKOUT.length);
    expect(quickAddFoods(builtinFoods(), "veg", POST_WORKOUT).map((p) => p.label)).toEqual(["Whey scoop", "Paneer 100 g", "Greek yogurt 200 g", "Curd rice"]);
  });
});
