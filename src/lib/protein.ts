import { addDays } from "./dates";
import { targetOn } from "./progress-logic";
import type { Food, Macros, Target } from "./types";

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

export const MEAL_PROTEIN = 40;

export interface ProteinIdea {
  food: Food;
  servings: number;
  protein: number;
  kcal: number;
}

// High-protein foods sized to close today's gap without blowing the calorie
// budget. Foods you already eat rank first. Pass everyday foods only, not
// the long tail of cookbook recipes.
export function proteinIdeas(
  gap: number,
  kcalLeft: number,
  candidates: Food[],
  useCounts: Map<string, number>,
  diet?: Diet,
  limit = 5,
): ProteinIdea[] {
  if (gap < 5) return [];
  // Size each idea to one meal's worth; a big gap is closed over the day.
  const aim = Math.min(gap, MEAL_PROTEIN);
  const seen = new Set<string>();
  return candidates
    .filter((f) => f.protein >= 6 && f.kcal > 0 && (f.protein * 4) / f.kcal >= 0.25 && !/\braw\b/i.test(f.name) && allowed(diet, f))
    .map((food) => {
      const servings = Math.min(3, Math.max(1, Math.round(aim / food.protein)));
      const protein = food.protein * servings;
      const kcal = food.kcal * servings;
      const density = (food.protein * 4) / food.kcal;
      const coverage = Math.min(protein, aim) / aim;
      const fits = kcalLeft <= 0 || kcal <= Math.max(kcalLeft, 150);
      const familiar = Math.log1p(useCounts.get(food.id) ?? 0);
      return { food, servings, protein, kcal, score: density * 1.5 + coverage + familiar * 0.6 + (fits ? 0.5 : -1) };
    })
    // A suggestion that overshoots the gap by a lot isn't a fix, it's a meal.
    .filter((i) => i.protein <= aim * 1.6 + 10)
    .sort((a, b) => b.score - a.score)
    .filter(({ food }) => {
      // One idea per staple: no three kinds of paneer in a row.
      const key = food.name.toLowerCase().replace(/[^a-z ]/g, "").split(" ").find((w) => w.length > 3) ?? food.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ food, servings, protein, kcal }) => ({ food, servings, protein, kcal }));
}
