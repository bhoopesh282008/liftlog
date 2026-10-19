import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { undoAdjustment } from "@/lib/repo";
import type { Target } from "@/lib/types";
import { kcal } from "./format";

// The weekly check-in moved the calorie target; shown until acknowledged.
export function AdjustmentBanner({ adjustment }: { adjustment: Target }) {
  return (
    <div className="animate-enter card mb-3 border-accent/30 bg-accent-soft p-4">
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-accent" />
        <div className="flex-1 text-sm">
          <p className="font-semibold">New calorie target: {kcal(adjustment.calories)}</p>
          <p className="mt-1 text-muted">{adjustment.reason}</p>
          <div className="mt-2 flex gap-2">
            <button className="btn min-h-9 bg-surface text-sm" onClick={() => void db.meta.delete("unseenAdjustment")}>
              Got it
            </button>
            <button className="btn btn-ghost min-h-9 text-sm" onClick={() => void undoAdjustment(adjustment)}>
              Undo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
