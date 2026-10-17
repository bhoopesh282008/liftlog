import type { DayLog, FoodEntry, Profile, SupplementId } from "./types";

export interface Supplement {
  id: SupplementId;
  label: string;
  detail?: string;
  // Supplements with macros are logged as this food so they count in the
  // day's totals.
  foodId?: string;
  trainingOnly?: boolean;
}

export const SUPPLEMENTS: Supplement[] = [
  { id: "whey", label: "Whey", detail: "1 scoop, counted in your food", foodId: "curated:whey" },
  { id: "mass-gainer", label: "Mass gainer", detail: "1 serving, counted in your food", foodId: "curated:mass-gainer" },
  { id: "creatine", label: "Creatine 5 g", detail: "Every day, rest days too" },
  { id: "multivitamin", label: "Multivitamin" },
  { id: "fish-oil", label: "Fish oil" },
  { id: "pre-workout", label: "Pre-workout", detail: "Training days only", trainingOnly: true },
];

// Before you pick, LiftLog shows what it always had: whey and creatine.
export const takenOf = (p: Pick<Profile, "supplements"> | undefined): SupplementId[] => p?.supplements ?? ["whey", "creatine"];

// What's ticked off for the day: creatine and the plain pills from the day
// log, whey and mass gainer from logged food (servings, so 2 scoops is 2).
export function checkedSupplements(
  day: Pick<DayLog, "creatine" | "supplements"> | undefined,
  entries: Pick<FoodEntry, "foodId" | "servings">[],
): Map<SupplementId, number> {
  const out = new Map<SupplementId, number>();
  if (day?.creatine) out.set("creatine", 1);
  for (const id of day?.supplements ?? []) out.set(id, 1);
  for (const s of SUPPLEMENTS) {
    if (!s.foodId) continue;
    const n = entries.filter((e) => e.foodId === s.foodId).reduce((a, e) => a + e.servings, 0);
    if (n > 0) out.set(s.id, n);
  }
  return out;
}

// The ones you take that are due today, in a fixed order.
export function dueSupplements(taken: SupplementId[], training: boolean): Supplement[] {
  return SUPPLEMENTS.filter((s) => taken.includes(s.id) && (!s.trainingOnly || training));
}

// Due today and not ticked off yet: what the reminder lists.
export function missedSupplements(taken: SupplementId[], checked: Map<SupplementId, number>, training: boolean): Supplement[] {
  return dueSupplements(taken, training).filter((s) => !checked.has(s.id));
}
