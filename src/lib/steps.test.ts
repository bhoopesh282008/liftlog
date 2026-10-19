import { describe, expect, it } from "vitest";
import { parseSteps, stepsKcal, weekSteps } from "./steps";

describe("parseSteps", () => {
  it("accepts whole numbers, with or without separators", () => {
    expect(parseSteps("8123")).toBe(8123);
    expect(parseSteps("8,123")).toBe(8123);
    expect(parseSteps(" 12 450 ")).toBe(12450);
    expect(parseSteps("0")).toBe(0);
  });
  it("rejects junk, negatives, decimals and absurd counts", () => {
    for (const bad of [null, undefined, "", "abc", "-5", "12.5e3", "1e5", "100001"]) expect(parseSteps(bad)).toBeNull();
  });
});

describe("stepsKcal", () => {
  it("scales with steps and body weight", () => {
    expect(stepsKcal(10_000, 80)).toBe(400);
    expect(stepsKcal(0, 70)).toBe(0);
  });
});

describe("weekSteps", () => {
  it("returns the 7 days ending on the date, oldest first, gaps as 0", () => {
    const week = weekSteps(
      [
        { id: "2026-10-19:steps", date: "2026-10-19", steps: 9000 },
        { id: "2026-10-15:steps", date: "2026-10-15", steps: 4000 },
        { id: "2026-10-12:steps", date: "2026-10-12", steps: 99 },
        { id: "2026-10-18:steps", date: "2026-10-18", steps: 7000, deletedAt: 1 },
        { id: "2026-10-19", date: "2026-10-19" }, // that day's water record: ignored
      ],
      "2026-10-19",
    );
    expect(week.map((d) => d.date)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]);
    expect(week.map((d) => d.steps)).toEqual([0, 0, 4000, 0, 0, 0, 9000]);
  });
});
