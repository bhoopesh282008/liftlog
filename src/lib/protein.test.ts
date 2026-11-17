import { describe, expect, it } from "vitest";
import { builtinFoods } from "./data/food-sources";
import { INDB_ROWS } from "@/lib/data/indb-foods";
import { dietOf, lopsidedMeal, mealBand, proteinIdeas, proteinPer100Kcal, proteinStreak, quickAddFoods, VEG_GUIDE, vegProteinGuide } from "./protein";
import type { Macros, Meal, Target } from "./types";

const target = (protein: number): Target => ({
  id: "t",
  date: "2026-01-01",
  calories: 2700,
  protein,
  carbs: 300,
  fat: 75,
  source: "initial",
  reason: "",
  updatedAt: 0,
});
const m = (protein: number): Macros => ({ kcal: 2000, protein, carbs: 0, fat: 0 });

describe("protein streak", () => {
  const targets = [target(140)];

  it("counts days in a row at 95% of the goal or more", () => {
    const totals = new Map([
      ["2026-10-13", m(150)],
      ["2026-10-14", m(134)],
      ["2026-10-15", m(140)],
    ]);
    expect(proteinStreak(totals, targets, "2026-10-16")).toBe(3);
  });

  it("includes today once it's met, and stops at a miss", () => {
    const totals = new Map([
      ["2026-10-14", m(90)],
      ["2026-10-15", m(140)],
      ["2026-10-16", m(141)],
    ]);
    expect(proteinStreak(totals, targets, "2026-10-16")).toBe(2);
  });
});

describe("protein ideas", () => {
  const foods = builtinFoods()
    .filter((b) => b.common)
    .map((b) => b.food);

  it("suggests 3 lean, high-protein foods that close the gap", () => {
    const ideas = proteinIdeas(40, 800, foods);
    expect(ideas).toHaveLength(3);
    for (const i of ideas) expect((i.food.protein * 4) / i.food.kcal).toBeGreaterThanOrEqual(0.25);
    expect(ideas.some((i) => /whey|paneer|chicken|egg|soya|yogurt/i.test(i.food.name))).toBe(true);
  });

  it("ranks by protein per 100 kcal", () => {
    const ideas = proteinIdeas(40, 800, foods);
    for (let k = 1; k < ideas.length; k++) expect(ideas[k - 1].per100).toBeGreaterThanOrEqual(ideas[k].per100);
    expect(ideas[0].per100).toBe(proteinPer100Kcal(ideas[0].food));
  });

  it("only suggests what fits the calories left", () => {
    const ideas = proteinIdeas(40, 200, foods);
    expect(ideas.length).toBeGreaterThan(0);
    for (const i of ideas) expect(i.kcal).toBeLessThanOrEqual(200);
    expect(proteinIdeas(40, 0, foods)).toEqual([]);
    expect(proteinIdeas(40, -100, foods)).toEqual([]);
  });

  it("never overshoots the gap into a whole meal", () => {
    for (const i of proteinIdeas(40, 800, foods)) expect(i.protein).toBeLessThanOrEqual(74);
    expect(proteinIdeas(40, 800, foods).some((i) => /\braw\b/i.test(i.food.name))).toBe(false);
  });

  it("keeps meat and eggs out for vegetarians, and meat out for egg eaters", () => {
    const veg = proteinIdeas(40, 800, foods, "veg");
    expect(veg.length).toBeGreaterThan(0);
    for (const i of veg) expect(dietOf(i.food)).toBe("veg");
    for (const i of proteinIdeas(40, 800, foods, "egg")) expect(dietOf(i.food)).not.toBe("nonveg");
  });

  it("sizes ideas to one meal even when the gap is large", () => {
    for (const i of proteinIdeas(90, 1500, foods)) expect(i.protein).toBeLessThanOrEqual(74);
  });

  it("has nothing to suggest when the goal is met", () => {
    expect(proteinIdeas(2, 800, foods)).toEqual([]);
  });

  it("classifies foods by name", () => {
    expect(dietOf({ name: "Chicken tikka" })).toBe("nonveg");
    expect(dietOf({ name: "Egg bhurji, 2 eggs" })).toBe("egg");
    expect(dietOf({ name: "Paneer tikka" })).toBe("veg");
  });
});

describe("protein per 100 kcal", () => {
  it("divides protein by calories", () => {
    expect(proteinPer100Kcal({ protein: 24, kcal: 120 })).toBe(20);
    expect(proteinPer100Kcal({ protein: 18, kcal: 260 })).toBe(6.9);
    expect(proteinPer100Kcal({ protein: 5, kcal: 0 })).toBe(0);
  });
});

describe("meals", () => {
  it("places a meal's protein against 25–40 g", () => {
    expect(mealBand(12)).toBe("low");
    expect(mealBand(25)).toBe("in");
    expect(mealBand(40)).toBe("in");
    expect(mealBand(55)).toBe("high");
  });

  it("flags one meal holding over 60% of the day's protein", () => {
    const day = (rows: [Meal, number][]) => new Map(rows);
    expect(lopsidedMeal(day([["breakfast", 10], ["dinner", 70]]))).toEqual({ meal: "dinner", share: 0.875 });
    expect(lopsidedMeal(day([["breakfast", 30], ["dinner", 40]]))).toBeNull();
    expect(lopsidedMeal(day([["dinner", 70]]))).toBeNull();
    expect(lopsidedMeal(day([["lunch", 0], ["dinner", 0]]))).toBeNull();
  });
});

describe("quick add", () => {
  it("finds every staple in the built-in foods", () => {
    expect(quickAddFoods(builtinFoods("curated")).map((q) => q.food.id)).toEqual([
      "curated:whey",
      "curated:egg-boiled",
      "curated:chicken-breast-cooked",
      "curated:paneer",
      "curated:soya-chunks",
      "curated:dal-tadka",
      "curated:curd",
    ]);
  });

  // Needs the local INDB rows (gitignored), so it skips on a fresh clone.
  it.skipIf(INDB_ROWS.length === 0)("uses the INDB row that stands in for a curated food", () => {
    const egg = quickAddFoods(builtinFoods("indb")).find((q) => q.label === "2 eggs");
    expect(egg?.food.source).toBe("indb");
    expect(quickAddFoods(builtinFoods("indb"))).toHaveLength(7);
  });

  it("follows the diet preference", () => {
    expect(quickAddFoods(builtinFoods(), "veg").map((q) => q.label)).toEqual(["Whey scoop", "Paneer 100 g", "Soya 30 g", "Dal", "Curd"]);
    expect(quickAddFoods(builtinFoods(), "egg").map((q) => q.label)).toContain("2 eggs");
    expect(quickAddFoods(builtinFoods(), "egg").map((q) => q.label)).not.toContain("Chicken 100 g");
  });
});

describe("vegetarian protein guide", () => {
  it("lists every staple, all vegetarian, best protein per 100 kcal first", () => {
    for (const source of ["indb", "curated"] as const) {
      const guide = vegProteinGuide(builtinFoods(source));
      expect(guide).toHaveLength(VEG_GUIDE.length);
      for (const g of guide) expect(dietOf(g.food)).toBe("veg");
      for (let k = 1; k < guide.length; k++) expect(guide[k - 1].per100).toBeGreaterThanOrEqual(guide[k].per100);
      expect(guide[0].label).toBe("Whey");
    }
  });
});
