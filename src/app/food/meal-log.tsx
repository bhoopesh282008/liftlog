import { BookmarkPlus, ChefHat, Copy, Info } from "lucide-react";
import { useToast } from "@/components/toast";
import { dateKey } from "@/lib/dates";
import { entryTotals, sumMacros } from "@/lib/progress-logic";
import { lopsidedMeal, MEAL_BAND, mealBand } from "@/lib/protein";
import { copyEntries, logSavedMeal, remove } from "@/lib/repo";
import type { Food, FoodEntry, Meal, SavedMeal } from "@/lib/types";
import { MEALS } from "./food-sheets";
import { g, kcal } from "./format";
import { ResultList } from "./result-list";

// The day's log when not searching: copy shortcuts, saved meals, each meal's
// entries against its protein band, and recently eaten foods.
export function MealLog({
  date,
  entries,
  dayEntries,
  prevEntries,
  foods,
  savedMeals,
  defaultMeal,
  onEdit,
  onPick,
  onSaveMeal,
  onNewRecipe,
}: {
  date: string;
  entries: FoodEntry[];
  dayEntries: FoodEntry[];
  prevEntries: FoodEntry[];
  foods: Food[];
  savedMeals: SavedMeal[];
  defaultMeal: Meal;
  onEdit: (e: FoodEntry) => void;
  onPick: (food: Food, servings?: number) => void;
  onSaveMeal: (list: FoodEntry[]) => void;
  onNewRecipe: () => void;
}) {
  const toast = useToast();
  const prevLabel = date === dateKey() ? "yesterday" : "the day before";
  const copy = async (list: FoodEntry[], what: string) => {
    const ids = await copyEntries(list, date);
    toast(`Copied ${what}`, { label: "Undo", run: () => ids.forEach((id) => void remove("foodEntries", id)) });
  };
  const quickMeal = async (m: SavedMeal) => {
    const ids = await logSavedMeal(m, defaultMeal, date);
    toast(`Added ${m.name} to ${defaultMeal}`, { label: "Undo", run: () => ids.forEach((id) => void remove("foodEntries", id)) });
  };

  const perMeal = new Map<Meal, number>();
  for (const e of dayEntries) perMeal.set(e.meal, (perMeal.get(e.meal) ?? 0) + entryTotals(e).protein);
  const lopsided = lopsidedMeal(perMeal);

  const recent = (() => {
    const seen = new Set<string>();
    const out: FoodEntry[] = [];
    for (const e of [...entries].sort((a, b) => b.loggedAt - a.loggedAt)) {
      if (seen.has(e.foodId)) continue;
      seen.add(e.foodId);
      out.push(e);
      if (out.length >= 8) break;
    }
    return out;
  })();

  // A recent entry's food may have been deleted since; rebuild it from the entry.
  const relog = (e: FoodEntry): Food => {
    const stored = foods.find((f) => f.id === e.foodId);
    return stored ?? { id: e.foodId, name: e.name, serving: e.serving, servingGrams: null, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, source: e.foodId.startsWith("indb:") ? "indb" : e.foodId.startsWith("curated:") ? "curated" : "user", updatedAt: 0 };
  };

  return (
    <div className="animate-fade">
      {dayEntries.length === 0 && prevEntries.length > 0 && (
        <button className="btn mb-4 w-full" onClick={() => void copy(prevEntries, `food from ${prevLabel}`)}>
          <Copy size={18} /> Copy everything from {prevLabel} ({prevEntries.length} {prevEntries.length === 1 ? "item" : "items"})
        </button>
      )}
      {savedMeals.length > 0 && (
        <section className="mb-4">
          <h2 className="label mb-2 px-1">Saved meals · one tap adds to {defaultMeal}</h2>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {savedMeals.map((m) => (
              <button key={m.id} className="chip" onClick={() => void quickMeal(m)}>
                {m.name}
                <span className="num text-xs text-muted">{g(sumMacros(m.items).protein)} g</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {lopsided && (
        <p className="mb-3 flex gap-2 rounded-2xl bg-surface-2 p-3 text-sm text-muted">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>
            {MEALS.find((m) => m.value === lopsided.meal)!.label} holds {Math.round(lopsided.share * 100)}% of {date === dateKey() ? "today's" : "the day's"} protein. About {MEAL_BAND.min}–
            {MEAL_BAND.max} g at each meal works better for building muscle.
          </span>
        </p>
      )}

      {MEALS.map(({ value, label }) => {
        const list = dayEntries.filter((e) => e.meal === value);
        const sum = sumMacros(list);
        const band = mealBand(sum.protein);
        return (
          <section key={value} className="mb-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-semibold">{label}</h2>
              <div className="flex items-center">
                {list.length > 0 && (
                  <>
                    <span className="num mr-1 text-sm text-muted">
                      {kcal(sum.kcal)} kcal · <span className={band === "in" ? "font-medium text-accent" : band === "high" ? "text-text" : ""}>{g(sum.protein)} g</span>
                      {band === "low" && (
                        <span className="text-faint">
                          {" "}
                          / {MEAL_BAND.min}–{MEAL_BAND.max}
                        </span>
                      )}
                    </span>
                    <button className="flex size-10 items-center justify-center text-faint" onClick={() => onSaveMeal(list)} aria-label={`Save ${label} as a meal`}>
                      <BookmarkPlus size={18} />
                    </button>
                  </>
                )}
              </div>
            </div>
            {list.length > 0 ? (
              <ul className="card mt-1 divide-y divide-line px-4">
                {list.map((e) => {
                  const tt = entryTotals(e);
                  return (
                    <li key={e.id}>
                      <button className="press-inset flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left" onClick={() => onEdit(e)}>
                        <span className="min-w-0">
                          <span className="block truncate">{e.name}</span>
                          <span className="block text-xs text-muted">
                            {e.servings !== 1 && `${e.servings} × `}
                            {e.serving}
                          </span>
                        </span>
                        <span className="num shrink-0 text-right text-sm">
                          {g(tt.protein)} g<span className="block text-xs text-muted">{kcal(tt.kcal)} kcal</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : prevEntries.some((e) => e.meal === value) && dayEntries.length > 0 ? (
              <button
                className="flex min-h-10 items-center gap-1.5 px-1 text-sm text-muted"
                onClick={() => void copy(prevEntries.filter((e) => e.meal === value), `${label.toLowerCase()} from ${prevLabel}`)}
              >
                <Copy size={15} /> Copy {label.toLowerCase()} from {prevLabel}
              </button>
            ) : (
              <p className="px-1 pt-1 pb-2 text-sm text-faint">Nothing yet</p>
            )}
          </section>
        );
      })}

      <button className="btn mt-2 w-full" onClick={onNewRecipe}>
        <ChefHat size={18} /> New recipe
      </button>

      {recent.length > 0 && (
        <section className="mt-5">
          <h2 className="label mb-1 px-1">Recent</h2>
          <ResultList foods={recent.map(relog)} onPick={(f) => onPick(f, recent.find((r) => r.foodId === f.id)?.servings)} />
        </section>
      )}
    </div>
  );
}
