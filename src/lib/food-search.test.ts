import { describe, expect, it } from "vitest";
import { offToFood, searchLocal } from "./food-search";

describe("local food search", () => {
  it("finds Indian dishes by name and alias", () => {
    for (const source of ["indb", "curated"] as const) {
      expect(searchLocal("dal", [], new Map(), 25, source)[0].name.toLowerCase()).toContain("dal");
      expect(searchLocal("chapati", [], new Map(), 25, source).some((f) => f.name === "Roti")).toBe(true);
      expect(searchLocal("paneer butter masala", [], new Map(), 25, source)[0].name).toBe("Paneer butter masala");
    }
  });

  it("ranks frequently logged foods higher", () => {
    const counts = new Map([["curated:paneer-tikka", 10]]);
    expect(searchLocal("paneer", [], counts, 25, "curated")[0].id).toBe("curated:paneer-tikka");
  });
});

describe("INDB-backed search", () => {
  const top = (q: string) => searchLocal(q, [], new Map(), 25, "indb")[0];
  const sane = (f: { kcal: number; protein: number; carbs: number; fat: number }) =>
    Math.abs(4 * f.protein + 4 * f.carbs + 9 * f.fat - f.kcal) <= Math.max(25, f.kcal * 0.35);

  it("returns everyday dishes with sensible per-serving values", () => {
    const dal = top("dal");
    expect(dal.name.toLowerCase()).toContain("dal");
    expect(dal.kcal).toBeGreaterThan(80);
    expect(dal.kcal).toBeLessThan(450);
    expect(dal.protein).toBeGreaterThan(5);
    expect(sane(dal)).toBe(true);

    const roti = top("roti");
    expect(roti).toMatchObject({ id: "indb:asc096", name: "Roti", source: "indb", serving: "1 roti (≈35 g)" });
    expect(roti.kcal).toBeGreaterThan(50);
    expect(roti.kcal).toBeLessThan(200);
    expect(sane(roti)).toBe(true);

    const pbm = top("paneer butter masala");
    expect(pbm).toMatchObject({ name: "Paneer butter masala", source: "indb" });
    expect(pbm.kcal).toBeGreaterThan(150);
    expect(pbm.kcal).toBeLessThan(600);
    expect(pbm.protein).toBeGreaterThan(8);
    expect(sane(pbm)).toBe(true);
  });

  it("keeps curated aliases and INDB's own names searchable", () => {
    expect(top("chapati").name).toBe("Roti");
    expect(top("paneer makhani").name).toBe("Paneer butter masala");
    expect(searchLocal("rajmah", [], new Map(), 25, "indb")[0].name).toBe("Rajma");
  });

  it("falls back to curated foods INDB doesn't cover", () => {
    expect(top("whey").id).toBe("curated:whey");
    expect(searchLocal("roti", [], new Map(), 25, "indb").some((f) => f.id === "curated:roti")).toBe(false);
  });
});

describe("Open Food Facts conversion", () => {
  it("scales per-100 g values to the label serving", () => {
    const f = offToFood({
      code: "890",
      product_name: "Protein bar",
      brands: "Brand",
      serving_quantity: 60,
      serving_size: "1 bar (60 g)",
      nutriments: { "energy-kcal_100g": 400, proteins_100g: 33.3, carbohydrates_100g: 40, fat_100g: 15 },
    })!;
    expect(f.kcal).toBe(240);
    expect(f.protein).toBe(20);
    expect(f.serving).toBe("1 bar (60 g)");
  });

  it("skips products without energy", () => {
    expect(offToFood({ code: "1", product_name: "x", nutriments: {} })).toBeNull();
  });
});
