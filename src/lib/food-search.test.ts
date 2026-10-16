import { describe, expect, it } from "vitest";
import { offToFood, searchLocal } from "./food-search";

describe("local food search", () => {
  it("finds Indian dishes by name and alias", () => {
    expect(searchLocal("dal", [], new Map())[0].name.toLowerCase()).toContain("dal");
    expect(searchLocal("chapati", [], new Map()).some((f) => f.name === "Roti")).toBe(true);
    expect(searchLocal("paneer butter masala", [], new Map())[0].name).toBe("Paneer butter masala");
  });

  it("ranks frequently logged foods higher", () => {
    const counts = new Map([["curated:paneer-tikka", 10]]);
    expect(searchLocal("paneer", [], counts)[0].id).toBe("curated:paneer-tikka");
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
