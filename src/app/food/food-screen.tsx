"use client";

import { Barcode, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useState } from "react";
import { SendToObsidian } from "@/components/send-to-obsidian";
import { useToast } from "@/components/toast";
import { addDays, dateKey, formatDay } from "@/lib/dates";
import { dailyTotals } from "@/lib/progress-logic";
import { proteinStreak } from "@/lib/protein";
import { waterGoalGlasses } from "@/lib/training";
import { ensureFood, logFood, mealForNow, remove, save, saveMealFromEntries } from "@/lib/repo";
import type { Food, FoodEntry, Meal } from "@/lib/types";
import { AdjustmentBanner } from "./adjustment-banner";
import { BarcodeScanner } from "./barcode-scanner";
import { AddFoodSheet, CustomFoodSheet, type FoodTarget, NameSheet } from "./food-sheets";
import { HabitsCard } from "./habits-card";
import { MealLog } from "./meal-log";
import { ProteinCard } from "./protein-card";
import { ProteinIdeas } from "./protein-ideas";
import { QuickAdd } from "./quick-add";
import { RecipeSheet } from "./recipe-sheet";
import { SearchResults, useOnlineSearch } from "./search-results";
import { SupplementReminder } from "./supplement-reminder";
import { useFoodDay } from "./use-food-day";
import { WorkoutCard } from "./workout-card";

// The Food tab: one day's protein and calories, its log, and food search.
// It owns which sheet is open; the sections below render and report picks.
export function FoodScreen() {
  const [date, setDate] = useState(dateKey);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<FoodTarget | null>(null);
  const [scanning, setScanning] = useState(false);
  const [custom, setCustom] = useState<{ name: string; barcode?: string } | null>(null);
  const [savingMeal, setSavingMeal] = useState<FoodEntry[] | null>(null);
  const [recipe, setRecipe] = useState<{ food: Food | null } | null>(null);
  const [defaultMeal, setDefaultMeal] = useState<Meal>(() => mealForNow());
  const toast = useToast();
  const online = useOnlineSearch(query);
  const day = useFoodDay(date);

  if (!day) return null;
  const { data, isToday, totals, t, training } = day;
  const searching = query.trim().length > 0;
  const pick = (food: Food, servings?: number) => setTarget({ kind: "add", food, servings });

  const add = async (food: Food, servings: number, meal: Meal) => {
    const e = await logFood(food, servings, meal, date);
    setTarget(null);
    setQuery("");
    setDefaultMeal(meal);
    toast(`Added ${food.name}`, { label: "Undo", run: () => void remove("foodEntries", e.id) });
  };

  return (
    <div className="px-4 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <button className="btn btn-ghost btn-icon -ml-2" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-display text-[28px] leading-none font-bold uppercase">{formatDay(date)}</h1>
        <button
          className="btn btn-ghost btn-icon -mr-2"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= dateKey()}
          aria-label="Next day"
        >
          <ChevronRight size={22} />
        </button>
      </header>

      {data.adjustment && <AdjustmentBanner adjustment={data.adjustment} />}

      {t && (
        <>
          <ProteinCard
            eaten={totals}
            target={t}
            streak={isToday ? proteinStreak(dailyTotals(data.entries), data.targets, date) : 0}
            perKg={data.perKg}
            weightKg={data.latestKg}
            mode={data.mode}
            maintenance={day.maintenance}
            isToday={isToday}
            dayNote={day.dayNote}
          />
          <SendToObsidian date={date} className="btn btn-ghost -mt-1 mb-3 w-full text-sm" />
          {isToday && <SupplementReminder date={date} training={training} />}
          <QuickAdd quick={day.quick} date={date} meal={defaultMeal} />
          {day.phase && <WorkoutCard phase={day.phase} diet={data.diet} onPick={pick} />}
          {isToday && (
            <ProteinIdeas gap={t.protein - totals.protein} kcalLeft={t.calories - totals.kcal} candidates={day.candidates} diet={data.diet} onPick={pick} />
          )}
        </>
      )}

      <HabitsCard date={date} training={training} waterGoal={data.latestKg ? waterGoalGlasses(data.latestKg, training) : undefined} />

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
        <SearchResults
          query={query}
          online={online}
          foods={data.foods}
          useCounts={day.useCounts}
          onPick={(f) => pick(f)}
          onCreate={(name) => setCustom({ name })}
          onRecipe={() => setRecipe({ food: null })}
        />
      ) : (
        <MealLog
          date={date}
          entries={data.entries}
          dayEntries={day.dayEntries}
          prevEntries={day.prevEntries}
          foods={data.foods}
          savedMeals={data.savedMeals}
          defaultMeal={defaultMeal}
          onEdit={(entry) => setTarget({ kind: "edit", entry })}
          onPick={pick}
          onSaveMeal={setSavingMeal}
          onNewRecipe={() => setRecipe({ food: null })}
        />
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
