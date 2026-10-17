import { addDays } from "./dates";
import { targetOn } from "./progress-logic";
import type { BuiltinFood } from "./data/food-sources";
import type { Food, Macros, Meal, Target } from "./types";

export type Diet = "veg" | "egg" | "nonveg";

const NONVEG = /\b(chicken|mutton|fish|prawn|shrimp|keema|kheema|meat|lamb|goat|beef|pork|tuna|salmon|crab|shawarma|murgh|gosht|machli|meen)\b/i;
const EGG = /\b(egg|eggs|omelette|omelet|anda|bhurji egg)\b/i;

// Rough diet class from the food's name; good enough to keep chicken out of
// a vegetarian's suggestions.
export function dietOf(food: Pick<Food, "name">): Diet {
  if (NONVEG.test(food.name)) return "nonveg";
  if (EGG.test(food.name)) return "egg";
  return "veg";
}

const allowed = (diet: Diet | undefined, food: Food) => {
  if (!diet || diet === "nonveg") return true;
  const d = dietOf(food);
  return d === "veg" || (diet === "egg" && d === "egg");
};

const hit = (protein: number, goal: number) => goal > 0 && protein >= goal * 0.95;

// Days in a row the protein goal was met. Today counts once it's met, so
// the streak never looks broken in the morning.
export function proteinStreak(totals: Map<string, Macros>, targets: Target[], today: string): number {
  let day = today;
  const goalOn = (d: string) => targetOn(d, targets)?.protein ?? 0;
  if (!hit(totals.get(day)?.protein ?? 0, goalOn(day))) day = addDays(day, -1);
  let n = 0;
  while (hit(totals.get(day)?.protein ?? 0, goalOn(day))) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

// Grams of protein per 100 kcal: how much protein a food gives for its
// calories. Whey is about 20, paneer about 7, dal about 5.
export const proteinPer100Kcal = (f: Pick<Macros, "protein" | "kcal">) => (f.kcal > 0 ? Math.round((f.protein / f.kcal) * 1000) / 10 : 0);

// The protein worth aiming for at one meal.
export const MEAL_BAND = { min: 25, max: 40 } as const;
export const MEAL_PROTEIN = MEAL_BAND.max;

export type MealBand = "low" | "in" | "high";
export const mealBand = (protein: number): MealBand => (protein < MEAL_BAND.min ? "low" : protein > MEAL_BAND.max ? "high" : "in");

// With two or more meals logged, the one holding over 60% of the day's
// protein, so the app can suggest spreading it out. Pass only meals that
// have food in them.
export function lopsidedMeal(perMeal: Map<Meal, number>): { meal: Meal; share: number } | null {
  if (perMeal.size < 2) return null;
  const total = [...perMeal.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const [meal, protein] = [...perMeal.entries()].sort((a, b) => b[1] - a[1])[0];
  const share = protein / total;
  return share > 0.6 ? { meal, share } : null;
}

// One-tap staples. Ids are curated foods; with INDB on, the INDB row that
// stands in for one is used instead.
export interface FoodPick {
  id: string;
  label: string;
  servings: number;
}

export const QUICK_ADD: FoodPick[] = [
  { id: "curated:whey", label: "Whey scoop", servings: 1 },
  { id: "curated:egg-boiled", label: "2 eggs", servings: 2 },
  { id: "curated:chicken-breast-cooked", label: "Chicken 100 g", servings: 1 },
  { id: "curated:paneer", label: "Paneer 100 g", servings: 1 },
  { id: "curated:soya-chunks", label: "Soya 30 g", servings: 1 },
  { id: "curated:dal-tadka", label: "Dal", servings: 1 },
  { id: "curated:curd", label: "Curd", servings: 1 },
];

// 1–2 hours before training: easy carbs with a little protein.
export const PRE_WORKOUT: FoodPick[] = [
  { id: "curated:banana", label: "Banana", servings: 1 },
  { id: "curated:idli", label: "3 idli", servings: 3 },
  { id: "curated:poha", label: "Poha", servings: 1 },
  { id: "curated:oats-milk", label: "Oats with milk", servings: 1 },
  { id: "curated:dates", label: "4 dates", servings: 2 },
];

// Within a couple of hours after: 25–40 g protein, with carbs.
export const POST_WORKOUT: FoodPick[] = [
  { id: "curated:whey", label: "Whey scoop", servings: 1 },
  { id: "curated:egg-boiled", label: "3 eggs", servings: 3 },
  { id: "curated:chicken-breast-cooked", label: "Chicken 100 g", servings: 1 },
  { id: "curated:paneer", label: "Paneer 100 g", servings: 1 },
  { id: "curated:greek-yogurt", label: "Greek yogurt 200 g", servings: 2 },
  { id: "curated:curd-rice", label: "Curd rice", servings: 1 },
];

// Vegetarian staples for the protein guide on Progress.
export const VEG_GUIDE: FoodPick[] = [
  { id: "curated:whey", label: "Whey", servings: 1 },
  { id: "curated:soya-chunks", label: "Soya chunks", servings: 1 },
  { id: "curated:paneer", label: "Paneer", servings: 1 },
  { id: "curated:curd", label: "Curd", servings: 1 },
  { id: "curated:kala-chana", label: "Kala chana", servings: 1 },
  { id: "curated:dal-tadka", label: "Dal", servings: 1 },
];

// The guide's foods, best protein per 100 kcal first.
export function vegProteinGuide(builtins: BuiltinFood[]) {
  return quickAddFoods(builtins, "veg", VEG_GUIDE)
    .map((p) => ({ ...p, per100: proteinPer100Kcal(p.food) }))
    .sort((a, b) => b.per100 - a.per100);
}

export function quickAddFoods(builtins: BuiltinFood[], diet?: Diet, picks = QUICK_ADD) {
  return picks.flatMap((q) => {
    const food = builtins.find((b) => b.food.id === q.id || b.replaces === q.id)?.food;
    return food && allowed(diet, food) ? [{ ...q, food }] : [];
  });
}

export interface ProteinIdea {
  food: Food;
  servings: number;
  protein: number;
  kcal: number;
  per100: number;
}

// When protein is short: foods that fit what's left of today's protein and
// calories, best protein per 100 kcal first. Pass everyday foods only, not
// the long tail of cookbook recipes.
export function proteinIdeas(gap: number, kcalLeft: number, candidates: Food[], diet?: Diet, limit = 3): ProteinIdea[] {
  if (gap < 5 || kcalLeft <= 0) return [];
  // Size each idea to one meal's worth; a big gap is closed over the day.
  const aim = Math.min(gap, MEAL_BAND.max);
  const seen = new Set<string>();
  return candidates
    .filter((f) => f.protein >= 6 && f.kcal > 0 && (f.protein * 4) / f.kcal >= 0.25 && !/\braw\b/i.test(f.name) && allowed(diet, f))
    .flatMap((food): ProteinIdea[] => {
      // The most servings (up to 3) that stay inside today's calories.
      let servings = Math.min(3, Math.max(1, Math.round(aim / food.protein)));
      while (servings > 1 && food.kcal * servings > kcalLeft) servings--;
      const protein = food.protein * servings;
      const kcal = food.kcal * servings;
      // Too many calories, a whole meal's overshoot, or too little to matter.
      if (kcal > kcalLeft || protein > aim * 1.6 + 10 || protein < Math.min(aim, 15)) return [];
      return [{ food, servings, protein, kcal, per100: proteinPer100Kcal(food) }];
    })
    .sort((a, b) => b.per100 - a.per100)
    .filter(({ food }) => {
      // One idea per staple: no three kinds of paneer in a row.
      const key = food.name.toLowerCase().replace(/[^a-z ]/g, "").split(" ").find((w) => w.length > 3) ?? food.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
