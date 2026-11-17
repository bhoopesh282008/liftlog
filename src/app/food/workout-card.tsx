"use client";

import { Dumbbell } from "lucide-react";
import { builtinFoods } from "@/lib/data/food-sources";
import { type Diet, POST_WORKOUT, PRE_WORKOUT, quickAddFoods } from "@/lib/protein";
import type { WorkoutPhase } from "@/lib/training";
import type { Food } from "@/lib/types";

const COPY: Record<WorkoutPhase, { title: string; body: string }> = {
  pre: { title: "Before your workout", body: "Easy carbs with a little protein, 1–2 hours before." },
  post: { title: "After your workout", body: "25–40 g of protein with some carbs in the next couple of hours." },
};

// Food ideas around today's workout. Tapping one opens it ready to add.
export function WorkoutCard({ phase, diet, onPick }: { phase: WorkoutPhase; diet: Diet | undefined; onPick: (food: Food, servings: number) => void }) {
  const picks = quickAddFoods(builtinFoods(), diet, phase === "pre" ? PRE_WORKOUT : POST_WORKOUT);
  return (
    <section className="card mb-4 p-4" aria-labelledby="workout-food">
      <h2 id="workout-food" className="flex items-center gap-2 font-semibold">
        <Dumbbell size={16} className="text-muted" aria-hidden /> {COPY[phase].title}
      </h2>
      <p className="mt-1 text-sm text-muted">{COPY[phase].body}</p>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {picks.map((p) => (
          <button key={p.id} className="chip shrink-0" onClick={() => onPick(p.food, p.servings)}>
            {p.label}
            <span className="num text-xs text-muted">
              {Math.round(p.food.protein * p.servings)} g · {Math.round(p.food.kcal * p.servings)} kcal
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
