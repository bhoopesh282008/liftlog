import { addDays, weekStart } from "./dates";
import type { FoodEntry, Macros, Target, WeightEntry } from "./types";

export function entryTotals(e: Pick<FoodEntry, keyof Macros | "servings">): Macros {
  return {
    kcal: e.kcal * e.servings,
    protein: e.protein * e.servings,
    carbs: e.carbs * e.servings,
    fat: e.fat * e.servings,
  };
}

export function sumMacros(entries: Pick<FoodEntry, keyof Macros | "servings">[]): Macros {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) {
    const t = entryTotals(e);
    total.kcal += t.kcal;
    total.protein += t.protein;
    total.carbs += t.carbs;
    total.fat += t.fat;
  }
  return total;
}

export function weeklyWeightAverages(weights: Pick<WeightEntry, "date" | "kg">[]) {
  const weeks = new Map<string, number[]>();
  for (const w of weights) {
    const key = weekStart(w.date);
    weeks.set(key, [...(weeks.get(key) ?? []), w.kg]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, kgs]) => ({
      date: week,
      value: Math.round((kgs.reduce((a, b) => a + b, 0) / kgs.length) * 10) / 10,
    }));
}

// The target in force on a given day is the latest one dated on or before it.
export function targetOn(date: string, targets: Target[]): Target | null {
  let found: Target | null = null;
  for (const t of targets) {
    if (t.date <= date && (!found || t.date > found.date || (t.date === found.date && t.updatedAt > found.updatedAt))) {
      found = t;
    }
  }
  return found;
}

export interface DayAdherence {
  date: string;
  logged: boolean;
  proteinHit: boolean;
  caloriesHit: boolean;
}

// Protein counts as hit at 95% of target; calories within ±10%.
export function adherence(
  days: string[],
  entries: FoodEntry[],
  targets: Target[],
): DayAdherence[] {
  const byDay = new Map<string, FoodEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return days.map((date) => {
    const list = byDay.get(date) ?? [];
    const t = targetOn(date, targets);
    const sum = sumMacros(list);
    return {
      date,
      logged: list.length > 0,
      proteinHit: !!t && list.length > 0 && sum.protein >= t.protein * 0.95,
      caloriesHit: !!t && list.length > 0 && Math.abs(sum.kcal - t.calories) <= t.calories * 0.1,
    };
  });
}

export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}
