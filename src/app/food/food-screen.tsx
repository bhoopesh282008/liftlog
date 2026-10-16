"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Barcode, BookmarkPlus, ChefHat, ChevronLeft, ChevronRight, Copy, Plus, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { addDays, dateKey, formatDay } from "@/lib/dates";
import { builtinFoods } from "@/lib/data/food-sources";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { searchLocal, searchOnline } from "@/lib/food-search";
import { dailyTotals, entryTotals, sumMacros, targetOn } from "@/lib/progress-logic";
import { proteinStreak } from "@/lib/protein";
import { copyEntries, ensureFood, logFood, logSavedMeal, mealForNow, remove, save, saveMealFromEntries, undoAdjustment } from "@/lib/repo";
import type { Food, FoodEntry, Meal, SavedMeal } from "@/lib/types";
import { BarcodeScanner } from "./barcode-scanner";
import { AddFoodSheet, CustomFoodSheet, type FoodTarget, MEALS, NameSheet, sourceLabel } from "./food-sheets";
import { HabitsCard } from "./habits-card";
import { ProteinCard } from "./protein-card";
import { ProteinIdeas } from "./protein-ideas";
import { RecipeSheet } from "./recipe-sheet";

const kcal = (n: number) => Math.round(n).toLocaleString();
const g = (n: number) => `${Math.round(n)}`;

export function FoodScreen() {
  const [date, setDate] = useState(dateKey);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState<{ q: string; foods: Food[]; state: "idle" | "loading" | "done" | "error" }>({ q: "", foods: [], state: "idle" });
  const [target, setTarget] = useState<FoodTarget | null>(null);
  const [scanning, setScanning] = useState(false);
  const [custom, setCustom] = useState<{ name: string; barcode?: string } | null>(null);
  const [savingMeal, setSavingMeal] = useState<FoodEntry[] | null>(null);
  const [recipe, setRecipe] = useState<{ food: Food | null } | null>(null);
  const [defaultMeal, setDefaultMeal] = useState<Meal>(() => mealForNow());
  const toast = useToast();

  const data = useLiveQuery(async () => {
    const [entries, foods, savedMeals, targets, unseen, profile, weights] = await Promise.all([
      db.foodEntries.toArray(),
      db.foods.toArray(),
      db.savedMeals.toArray(),
      db.targets.toArray(),
      db.meta.get("unseenAdjustment"),
      db.profile.get(PROFILE_ID),
      db.weights.toArray(),
    ]);
    const liveTargets = alive(targets);
    return {
      entries: alive(entries),
      foods: alive(foods),
      savedMeals: alive(savedMeals),
      targets: liveTargets,
      adjustment: liveTargets.find((t) => t.id === unseen?.value) ?? null,
      perKg: profile?.proteinPerKg,
      diet: profile?.diet,
      latestKg: alive(weights).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.kg ?? null,
    };
  }, []);

  const candidates = useMemo(
    () => [...builtinFoods().filter((b) => b.common).map((b) => b.food), ...(data?.foods ?? [])],
    [data?.foods],
  );

  const useCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data?.entries ?? []) m.set(e.foodId, (m.get(e.foodId) ?? 0) + 1);
    return m;
  }, [data]);

  const localResults = useMemo(() => (data && query.trim() ? searchLocal(query, data.foods, useCounts) : []), [data, query, useCounts]);

  // Packaged foods come from Open Food Facts, searched after a short pause.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setOnline({ q, foods: [], state: "loading" });
      try {
        setOnline({ q, foods: await searchOnline(q, ctrl.signal), state: "done" });
      } catch {
        if (!ctrl.signal.aborted) setOnline({ q, foods: [], state: "error" });
      }
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  if (!data) return null;

  const dayEntries = data.entries.filter((e) => e.date === date).sort((a, b) => a.loggedAt - b.loggedAt);
  const prevEntries = data.entries.filter((e) => e.date === addDays(date, -1)).sort((a, b) => a.loggedAt - b.loggedAt);
  const prevLabel = date === dateKey() ? "yesterday" : "the day before";
  const copy = async (entries: FoodEntry[], what: string) => {
    const ids = await copyEntries(entries, date);
    toast(`Copied ${what}`, { label: "Undo", run: () => ids.forEach((id) => void remove("foodEntries", id)) });
  };
  const totals = sumMacros(dayEntries);
  const t = targetOn(date, data.targets);
  const searching = query.trim().length > 0;

  const recent = (() => {
    const seen = new Set<string>();
    const out: FoodEntry[] = [];
    for (const e of [...data.entries].sort((a, b) => b.loggedAt - a.loggedAt)) {
      if (seen.has(e.foodId)) continue;
      seen.add(e.foodId);
      out.push(e);
      if (out.length >= 8) break;
    }
    return out;
  })();

  const add = async (food: Food, servings: number, meal: Meal) => {
    const e = await logFood(food, servings, meal, date);
    setTarget(null);
    setQuery("");
    setDefaultMeal(meal);
    toast(`Added ${food.name}`, { label: "Undo", run: () => void remove("foodEntries", e.id) });
  };

  const quickMeal = async (m: SavedMeal) => {
    const ids = await logSavedMeal(m, defaultMeal, date);
    toast(`Added ${m.name} to ${defaultMeal}`, { label: "Undo", run: () => ids.forEach((id) => void remove("foodEntries", id)) });
  };

  const relog = (e: FoodEntry): Food => {
    const stored = data.foods.find((f) => f.id === e.foodId);
    return stored ?? { id: e.foodId, name: e.name, serving: e.serving, servingGrams: null, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, source: e.foodId.startsWith("indb:") ? "indb" : e.foodId.startsWith("curated:") ? "curated" : "user", updatedAt: 0 };
  };

  return (
    <div className="px-4 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <button className="btn btn-ghost btn-icon -ml-2" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold">{formatDay(date)}</h1>
        <button
          className="btn btn-ghost btn-icon -mr-2"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= dateKey()}
          aria-label="Next day"
        >
          <ChevronRight size={22} />
        </button>
      </header>

      {data.adjustment && (
        <div className="animate-enter card mb-3 border-accent/30 bg-accent-soft p-4">
          <div className="flex items-start gap-3">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-accent" />
            <div className="flex-1 text-sm">
              <p className="font-semibold">New calorie target: {kcal(data.adjustment.calories)}</p>
              <p className="mt-1 text-muted">{data.adjustment.reason}</p>
              <div className="mt-2 flex gap-2">
                <button className="btn min-h-9 bg-surface text-sm" onClick={() => void db.meta.delete("unseenAdjustment")}>
                  Got it
                </button>
                <button className="btn btn-ghost min-h-9 text-sm" onClick={() => void undoAdjustment(data.adjustment!)}>
                  Undo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {t && (
        <>
          <ProteinCard
            eaten={totals}
            target={t}
            streak={date === dateKey() ? proteinStreak(dailyTotals(data.entries), data.targets, date) : 0}
            perKg={data.perKg}
            weightKg={data.latestKg}
          />
          {date === dateKey() && (
            <ProteinIdeas
              gap={t.protein - totals.protein}
              kcalLeft={t.calories - totals.kcal}
              candidates={candidates}
              useCounts={useCounts}
              diet={data.diet}
              onPick={(food, servings) => setTarget({ kind: "add", food, servings })}
            />
          )}
        </>
      )}

      <HabitsCard date={date} />

      <div className="sticky top-0 z-10 -mx-4 mb-3 bg-bg/90 px-4 py-2 backdrop-blur-lg">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
            <input
              className="input pr-10 pl-10"
              placeholder="Search dal, paneer, protein bar…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
            />
            {searching && (
              <button className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center text-faint" onClick={() => setQuery("")} aria-label="Clear search">
                <X size={18} />
              </button>
            )}
          </div>
          <button className="btn btn-icon" onClick={() => setScanning(true)} aria-label="Scan barcode">
            <Barcode size={20} />
          </button>
        </div>
      </div>

      {searching ? (
        <div className="animate-fade">
          <ResultList foods={localResults} onPick={(f) => setTarget({ kind: "add", food: f })} />
          {query.trim().length >= 3 && (
            <section className="mt-4">
              <h2 className="label mb-1 px-1">Packaged foods</h2>
              {online.q === query.trim() && online.state === "done" ? (
                online.foods.length ? (
                  <ResultList foods={online.foods} onPick={(f) => setTarget({ kind: "add", food: f })} />
                ) : (
                  <p className="px-1 py-3 text-sm text-muted">No packaged matches.</p>
                )
              ) : online.state === "error" && online.q === query.trim() ? (
                <p className="px-1 py-3 text-sm text-muted">Packaged search needs a connection.</p>
              ) : (
                <p className="px-1 py-3 text-sm text-muted">Searching…</p>
              )}
            </section>
          )}
          <button className="btn mt-4 w-full" onClick={() => setCustom({ name: query.trim() })}>
            <Plus size={18} /> Create “{query.trim()}”
          </button>
          <button className="btn btn-ghost mt-1 w-full" onClick={() => setRecipe({ food: null })}>
            <ChefHat size={18} /> Build a recipe instead
          </button>
        </div>
      ) : (
        <div className="animate-fade">
          {dayEntries.length === 0 && prevEntries.length > 0 && (
            <button className="btn mb-4 w-full" onClick={() => void copy(prevEntries, `food from ${prevLabel}`)}>
              <Copy size={18} /> Copy everything from {prevLabel} ({prevEntries.length} {prevEntries.length === 1 ? "item" : "items"})
            </button>
          )}
          {data.savedMeals.length > 0 && (
            <section className="mb-4">
              <h2 className="label mb-2 px-1">Saved meals · one tap adds to {defaultMeal}</h2>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {data.savedMeals.map((m) => (
                  <button key={m.id} className="chip" onClick={() => void quickMeal(m)}>
                    {m.name}
                    <span className="num text-xs text-muted">{g(sumMacros(m.items).protein)} g</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {MEALS.map(({ value, label }) => {
            const list = dayEntries.filter((e) => e.meal === value);
            const sum = sumMacros(list);
            return (
              <section key={value} className="mb-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="font-semibold">{label}</h2>
                  <div className="flex items-center">
                    {list.length > 0 && (
                      <>
                        <span className="num mr-1 text-sm text-muted">
                          {kcal(sum.kcal)} kcal · {g(sum.protein)} g
                        </span>
                        <button className="flex size-10 items-center justify-center text-faint" onClick={() => setSavingMeal(list)} aria-label={`Save ${label} as a meal`}>
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
                          <button className="press-inset flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left" onClick={() => setTarget({ kind: "edit", entry: e })}>
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

          <button className="btn mt-2 w-full" onClick={() => setRecipe({ food: null })}>
            <ChefHat size={18} /> New recipe
          </button>

          {recent.length > 0 && (
            <section className="mt-5">
              <h2 className="label mb-1 px-1">Recent</h2>
              <ResultList
                foods={recent.map(relog)}
                onPick={(f) => setTarget({ kind: "add", food: f, servings: recent.find((r) => r.foodId === f.id)?.servings })}
              />
            </section>
          )}
        </div>
      )}

      <RecipeSheet
        open={!!recipe}
        recipe={recipe?.food ?? null}
        onClose={() => setRecipe(null)}
        onSaved={(food) => {
          setRecipe(null);
          setQuery("");
          setTarget({ kind: "add", food });
        }}
      />
      <AddFoodSheet
        target={target}
        defaultMeal={defaultMeal}
        onEditRecipe={(food) => {
          setTarget(null);
          setRecipe({ food });
        }}
        onClose={() => setTarget(null)}
        onAdd={add}
        onUpdate={async (entry, servings, meal) => {
          await save("foodEntries", { ...entry, servings, meal });
          setTarget(null);
        }}
        onDelete={async (entry) => {
          await remove("foodEntries", entry.id);
          setTarget(null);
          toast(`Removed ${entry.name}`, { label: "Undo", run: () => void save("foodEntries", { ...entry, deletedAt: null }) });
        }}
      />
      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onFound={(food) => {
          setScanning(false);
          setTarget({ kind: "add", food });
        }}
        onMissing={(code) => {
          setScanning(false);
          setCustom({ name: "", barcode: code });
        }}
      />
      <CustomFoodSheet
        open={!!custom}
        initialName={custom?.name ?? ""}
        barcode={custom?.barcode}
        onClose={() => setCustom(null)}
        onCreate={async (food) => {
          await ensureFood(food);
          setCustom(null);
          setTarget({ kind: "add", food });
        }}
      />
      <NameSheet
        open={!!savingMeal}
        title="Save as a meal"
        placeholder="Usual breakfast"
        action="Save meal"
        onClose={() => setSavingMeal(null)}
        onSubmit={async (name) => {
          await saveMealFromEntries(name, savingMeal!);
          setSavingMeal(null);
          toast(`Saved ${name}`);
        }}
      />
    </div>
  );
}

function ResultList({ foods, onPick }: { foods: Food[]; onPick: (f: Food) => void }) {
  if (foods.length === 0) return <p className="px-1 py-3 text-sm text-muted">No matches in your foods.</p>;
  return (
    <ul className="card divide-y divide-line px-4">
      {foods.map((f) => (
        <li key={f.id}>
          <button className="press-inset flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left" onClick={() => onPick(f)}>
            <span className="min-w-0">
              <span className="block truncate">{f.name}</span>
              <span className="block truncate text-xs text-muted">
                {f.serving} · {sourceLabel(f)}
              </span>
            </span>
            <span className="num shrink-0 text-right text-sm">
              {g(f.protein)} g<span className="block text-xs text-muted">{kcal(f.kcal)} kcal</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
