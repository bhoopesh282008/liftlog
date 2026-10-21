"use client";

import { Plus } from "lucide-react";
import { updateProfile } from "@/lib/repo";
import { type Diet, proteinIdeas } from "@/lib/protein";
import type { Food } from "@/lib/types";

const DIETS: { value: Diet; label: string }[] = [
  { value: "veg", label: "Veg" },
  { value: "egg", label: "Egg" },
  { value: "nonveg", label: "Non-veg" },
];

// When protein is short, 3 foods that fit today's remaining protein and
// calories, best protein per 100 kcal first. Tapping one opens it ready to
// add, with the servings filled in.
export function ProteinIdeas({
  gap,
  kcalLeft,
  candidates,
  diet,
  onPick,
}: {
  gap: number;
  kcalLeft: number;
  candidates: Food[];
  diet: Diet | undefined;
  onPick: (food: Food, servings: number) => void;
}) {
  const ideas = proteinIdeas(gap, kcalLeft, candidates, diet);
  if (gap < 10) return null;

  return (
    <section className="mb-4" aria-labelledby="protein-ideas">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 id="protein-ideas" className="font-semibold">
          Close the protein gap
        </h2>
        <div className="flex gap-1" role="group" aria-label="Diet">
          {DIETS.map((d) => (
            <button
              key={d.value}
              aria-pressed={(diet ?? "nonveg") === d.value}
              className="chip min-h-8 px-2.5 text-xs"
              data-on={(diet ?? "nonveg") === d.value}
              onClick={() => void updateProfile({ diet: d.value })}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <p className="-mt-1 mb-2 px-1 text-xs text-muted">Fits your calories left · most protein per 100 kcal first</p>
      {ideas.length === 0 ? (
        <p className="px-1 text-sm text-muted">No good matches left for today&apos;s calories. Search for a lean protein below.</p>
      ) : (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {ideas.map((i) => (
            <button
              key={i.food.id}
              className="press flex w-40 shrink-0 flex-col items-start rounded-2xl border border-line bg-surface p-3 text-left"
              onClick={() => onPick(i.food, i.servings)}
            >
              <span className="line-clamp-2 min-h-10 text-sm font-medium">{i.food.name}</span>
              <span className="num mt-1 text-lg font-semibold text-accent">+{Math.round(i.protein)} g</span>
              <span className="num text-xs text-muted">
                {i.servings > 1 ? `${i.servings} × ` : ""}
                {i.food.serving} · {Math.round(i.kcal)} kcal
              </span>
              <span className="num text-xs text-muted">{i.per100} g per 100 kcal</span>
              <span className="mt-2 flex items-center gap-1 text-xs font-medium text-muted">
                <Plus size={14} /> Add
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
