import { proteinPer100Kcal } from "@/lib/protein";
import type { Food } from "@/lib/types";
import { sourceLabel } from "./food-sheets";
import { g, kcal } from "./format";

export function ResultList({ foods, onPick }: { foods: Food[]; onPick: (f: Food) => void }) {
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
              <span className="block text-[11px] text-faint">{proteinPer100Kcal(f)} g/100 kcal</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
