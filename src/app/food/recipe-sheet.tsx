"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Minus, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Sheet, Stepper } from "@/components/ui";
import { alive, db } from "@/lib/db";
import { searchLocal, searchOnline } from "@/lib/food-search";
import { sumMacros } from "@/lib/progress-logic";
import { newId, save } from "@/lib/repo";
import type { Food, SavedMealItem } from "@/lib/types";

const r1 = (n: number) => Math.round(n * 10) / 10;

// Build a home recipe from ingredients for the whole pot, then log it by the
// serving. Saved as one of your foods, with the ingredients kept so you can
// edit it later.
export function RecipeSheet({ open, recipe, onClose, onSaved }: { open: boolean; recipe: Food | null; onClose: () => void; onSaved: (food: Food) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={recipe ? "Edit recipe" : "New recipe"}>
      <RecipeForm recipe={recipe} onSaved={onSaved} />
    </Sheet>
  );
}

function RecipeForm({ recipe, onSaved }: { recipe: Food | null; onSaved: (food: Food) => void }) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [serving, setServing] = useState(recipe?.serving ?? "1 katori");
  const [servings, setServings] = useState(recipe?.recipe?.servings ?? 4);
  const [items, setItems] = useState<SavedMealItem[]>(recipe?.recipe?.items ?? []);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState<{ q: string; foods: Food[] }>({ q: "", foods: [] });
  const userFoods = useLiveQuery(async () => alive(await db.foods.toArray()), []);

  const local = useMemo(
    () => (query.trim() ? searchLocal(query, (userFoods ?? []).filter((f) => f.id !== recipe?.id), new Map(), 8) : []),
    [query, userFoods, recipe?.id],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        setOnline({ q, foods: (await searchOnline(q, ctrl.signal)).slice(0, 6) });
      } catch {}
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const total = sumMacros(items);
  const per = {
    kcal: Math.round(total.kcal / servings),
    protein: r1(total.protein / servings),
    carbs: r1(total.carbs / servings),
    fat: r1(total.fat / servings),
  };
  const results = [...local, ...(online.q === query.trim() ? online.foods : [])];

  const add = async (f: Food) => {
    // Packaged foods have to exist locally so the recipe still opens offline.
    if (f.source === "off") {
      const existing = await db.foods.get(f.id);
      if (!existing) await save("foods", f);
    }
    setItems([...items, { foodId: f.id, name: f.brand ? `${f.name} (${f.brand})` : f.name, serving: f.serving, servings: 1, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat }]);
    setQuery("");
  };

  return (
    <div className="space-y-4">
      <input className="input" placeholder="Recipe name, like Mom's rajma" value={name} onChange={(e) => setName(e.target.value)} />

      <div>
        <p className="label mb-1.5">Ingredients for the whole pot</p>
        {items.length > 0 && (
          <ul className="mb-2 divide-y divide-line rounded-2xl border border-line px-3">
            {items.map((it, i) => (
              <li key={`${it.foodId}-${i}`} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{it.name}</span>
                  <span className="num block truncate text-xs text-muted">
                    {it.servings} × {it.serving} · {Math.round(it.kcal * it.servings)} kcal · {r1(it.protein * it.servings)} g protein
                  </span>
                </span>
                <button
                  className="flex size-9 items-center justify-center rounded-lg bg-surface-2"
                  aria-label="Less"
                  onClick={() => setItems(items.map((x, k) => (k === i ? { ...x, servings: Math.max(0.25, x.servings - 0.5) } : x)))}
                >
                  <Minus size={14} />
                </button>
                <button
                  className="flex size-9 items-center justify-center rounded-lg bg-surface-2"
                  aria-label="More"
                  onClick={() => setItems(items.map((x, k) => (k === i ? { ...x, servings: x.servings + 0.5 } : x)))}
                >
                  <Plus size={14} />
                </button>
                <button className="flex size-9 items-center justify-center text-faint" aria-label={`Remove ${it.name}`} onClick={() => setItems(items.filter((_, k) => k !== i))}>
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="relative">
          <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
          <input className="input pl-10" placeholder="Add an ingredient: toor dal, ghee, onion…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {query.trim() && (
          <ul className="mt-1 max-h-56 divide-y divide-line overflow-y-auto rounded-2xl border border-line px-3">
            {results.length === 0 && <li className="py-3 text-sm text-muted">No matches yet…</li>}
            {results.map((f) => (
              <li key={f.id}>
                <button className="flex min-h-12 w-full items-center justify-between gap-2 py-1.5 text-left" onClick={() => void add(f)}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{f.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {f.serving}
                      {f.brand ? ` · ${f.brand}` : ""}
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-muted">{f.kcal} kcal</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="label mb-1.5">Makes</p>
          <Stepper label="servings the pot makes" value={servings} step={1} min={1} onChange={(v) => setServings(Math.max(1, Math.round(v)))} format={(v) => `${v}`} />
        </div>
        <label className="block">
          <span className="label mb-1.5 block">One serving is</span>
          <input className="input" value={serving} onChange={(e) => setServing(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {(
          [
            ["kcal", per.kcal],
            ["protein", per.protein],
            ["carbs", per.carbs],
            ["fat", per.fat],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-2xl bg-surface-2 py-2.5">
            <p className="num text-lg font-semibold">
              {v}
              {label !== "kcal" && <span className="text-sm font-normal text-muted">g</span>}
            </p>
            <p className="text-xs text-muted">{label} / serving</p>
          </div>
        ))}
      </div>

      <button
        className="btn btn-primary w-full"
        disabled={!name.trim() || !serving.trim() || items.length === 0}
        onClick={async () => {
          const food = await save("foods", {
            id: recipe?.id ?? newId(),
            name: name.trim(),
            serving: serving.trim(),
            servingGrams: null,
            ...per,
            source: "user",
            recipe: { servings, items },
          });
          onSaved(food);
        }}
      >
        Save recipe
      </button>
    </div>
  );
}
