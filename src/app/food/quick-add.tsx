import { useToast } from "@/components/toast";
import type { quickAddFoods } from "@/lib/protein";
import { logFood, remove } from "@/lib/repo";
import type { Meal } from "@/lib/types";
import { g } from "./format";

// One-tap protein staples, added straight to the current meal.
export function QuickAdd({ quick, date, meal }: { quick: ReturnType<typeof quickAddFoods>; date: string; meal: Meal }) {
  const toast = useToast();
  if (quick.length === 0) return null;
  return (
    <section className="mb-4" aria-labelledby="quick-add">
      <h2 id="quick-add" className="label mb-2 px-1">
        Quick add · one tap adds to {meal}
      </h2>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {quick.map((q) => (
          <button
            key={q.id}
            className="chip shrink-0"
            onClick={async () => {
              const e = await logFood(q.food, q.servings, meal, date);
              toast(`Added ${q.label} to ${meal}`, { label: "Undo", run: () => void remove("foodEntries", e.id) });
            }}
          >
            {q.label}
            <span className="num text-xs text-muted">+{g(q.food.protein * q.servings)} g</span>
          </button>
        ))}
      </div>
    </section>
  );
}
