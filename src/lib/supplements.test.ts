import { describe, expect, it } from "vitest";
import { CURATED_FOODS } from "./data/indian-foods";
import { checkedSupplements, dueSupplements, missedSupplements, SUPPLEMENTS, takenOf } from "./supplements";

describe("supplements", () => {
  it("defaults to whey and creatine until you pick", () => {
    expect(takenOf(undefined)).toEqual(["whey", "creatine"]);
    expect(takenOf({ supplements: ["fish-oil"] })).toEqual(["fish-oil"]);
  });

  it("has a built-in food for each one with macros", () => {
    for (const s of SUPPLEMENTS.filter((x) => x.foodId)) expect(CURATED_FOODS.some((f) => f.id === s.foodId)).toBe(true);
  });

  it("reads ticks from the day log and from logged food", () => {
    const checked = checkedSupplements({ creatine: true, supplements: ["fish-oil"] }, [
      { foodId: "curated:whey", servings: 1 },
      { foodId: "curated:whey", servings: 1 },
      { foodId: "curated:rice", servings: 1 },
    ]);
    expect(Object.fromEntries(checked)).toEqual({ creatine: 1, "fish-oil": 1, whey: 2 });
    expect(checkedSupplements(undefined, []).size).toBe(0);
  });

  it("keeps pre-workout to training days and creatine every day", () => {
    const taken = ["creatine", "pre-workout", "multivitamin"] as const;
    expect(dueSupplements([...taken], false).map((s) => s.id)).toEqual(["creatine", "multivitamin"]);
    expect(dueSupplements([...taken], true).map((s) => s.id)).toEqual(["creatine", "multivitamin", "pre-workout"]);
  });

  it("reminds about what's due and not ticked", () => {
    const missed = missedSupplements(["whey", "creatine", "fish-oil"], new Map([["whey", 1]]), false);
    expect(missed.map((s) => s.id)).toEqual(["creatine", "fish-oil"]);
    expect(missedSupplements([], new Map(), true)).toEqual([]);
  });
});
