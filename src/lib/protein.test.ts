import { describe, expect, it } from "vitest";
import { builtinFoods } from "./data/food-sources";
import { dietOf, proteinIdeas, proteinStreak } from "./protein";
import type { Macros, Target } from "./types";

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

  it("suggests lean, high-protein foods that close the gap", () => {
    const ideas = proteinIdeas(40, 800, foods, new Map());
    expect(ideas.length).toBeGreaterThanOrEqual(3);
    for (const i of ideas) expect((i.food.protein * 4) / i.food.kcal).toBeGreaterThanOrEqual(0.25);
    expect(ideas.some((i) => /whey|paneer|chicken|egg|soya|yogurt/i.test(i.food.name))).toBe(true);
  });

  it("never overshoots the gap into a whole meal", () => {
    for (const i of proteinIdeas(40, 800, foods, new Map())) expect(i.protein).toBeLessThanOrEqual(74);
    expect(proteinIdeas(40, 800, foods, new Map()).some((i) => /\braw\b/i.test(i.food.name))).toBe(false);
  });

  it("keeps meat and eggs out for vegetarians", () => {
    const ideas = proteinIdeas(40, 800, foods, new Map(), "veg");
    expect(ideas.length).toBeGreaterThan(0);
    for (const i of ideas) expect(dietOf(i.food)).toBe("veg");
  });

  it("sizes ideas to one meal even when the gap is large", () => {
    for (const i of proteinIdeas(90, 1500, foods, new Map())) expect(i.protein).toBeLessThanOrEqual(74);
  });

  it("has nothing to suggest when the goal is met", () => {
    expect(proteinIdeas(2, 800, foods, new Map())).toEqual([]);
  });

  it("classifies foods by name", () => {
    expect(dietOf({ name: "Chicken tikka" })).toBe("nonveg");
    expect(dietOf({ name: "Egg bhurji, 2 eggs" })).toBe("egg");
    expect(dietOf({ name: "Paneer tikka" })).toBe("veg");
  });
});
