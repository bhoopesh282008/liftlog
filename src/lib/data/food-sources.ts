import type { Food } from "../types";
import { CURATED_FOODS, curatedSearchText } from "./indian-foods";
import { INDB_ROWS } from "./indb-foods";

// Which built-in Indian food data the app searches.
//   "indb":    INDB recipes (scripts/import-indb.ts), plus curated foods that
//              INDB doesn't cover (packaged items, fruit, restaurant dishes,
//              and dishes whose INDB rows failed the importer's checks).
//   "curated": only the hand-curated estimates in indian-foods.ts.
// INDB's reuse terms are unconfirmed (its repo has no license file), so it
// must stay easy to switch off: set NEXT_PUBLIC_BUILTIN_FOODS=curated, or
// delete indb-foods.ts and this import. Logged entries snapshot their macros,
// so switching never changes past logs.
export type BuiltinSource = "indb" | "curated";

export const BUILTIN_SOURCE: BuiltinSource = process.env.NEXT_PUBLIC_BUILTIN_FOODS === "curated" ? "curated" : "indb";

export interface BuiltinFood {
  food: Food;
  // Lowercase name plus aliases, for search.
  text: string;
  // Everyday dishes (everything curated, and INDB rows standing in for one)
  // rank above INDB's long tail of cookbook recipes.
  common: boolean;
}

const curated = (): BuiltinFood[] => CURATED_FOODS.map((food) => ({ food, text: curatedSearchText(food), common: true }));

function withIndb(): BuiltinFood[] {
  const byId = new Map(CURATED_FOODS.map((f) => [f.id.slice("curated:".length), f]));
  const replaced = new Set<string>();
  const indb = INDB_ROWS.map(([code, name, serving, kcal, protein, carbs, fat, indbName, replaces]): BuiltinFood => {
    const old = replaces ? byId.get(replaces) : undefined;
    if (old) replaced.add(old.id);
    const food: Food = {
      id: `indb:${code.toLowerCase()}`,
      name,
      serving,
      servingGrams: null,
      kcal,
      protein,
      carbs,
      fat,
      source: "indb",
      updatedAt: 0,
    };
    const text = [name, indbName, old ? curatedSearchText(old) : ""].join(" ").toLowerCase();
    return { food, text, common: !!old };
  });
  return [...indb, ...curated().filter((b) => !replaced.has(b.food.id))];
}

const cache = new Map<BuiltinSource, BuiltinFood[]>();

export function builtinFoods(source: BuiltinSource = BUILTIN_SOURCE): BuiltinFood[] {
  let list = cache.get(source);
  if (!list) {
    list = source === "indb" ? withIndb() : curated();
    cache.set(source, list);
  }
  return list;
}
