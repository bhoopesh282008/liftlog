"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Circle, Pill } from "lucide-react";
import { useToast } from "@/components/toast";
import { CURATED_FOODS } from "@/lib/data/indian-foods";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { toggleSupplement } from "@/lib/repo";
import { checkedSupplements, dueSupplements, missedSupplements, type Supplement, takenOf } from "@/lib/supplements";

// The day's supplements, and a toggle that confirms food-logged ones with
// an undo toast.
export function useSupplements(date: string, training: boolean) {
  const toast = useToast();
  const data = useLiveQuery(async () => {
    const [day, profile, entries] = await Promise.all([
      db.days.get(date),
      db.profile.get(PROFILE_ID),
      db.foodEntries.where("date").equals(date).toArray(),
    ]);
    const taken = takenOf(profile);
    const checked = checkedSupplements(day && !day.deletedAt ? day : undefined, alive(entries));
    return { due: dueSupplements(taken, training), missed: missedSupplements(taken, checked, training), checked };
  }, [date, training]);

  const toggle = async (s: Supplement) => {
    const wasOn = data?.checked.has(s.id) ?? false;
    const undo = await toggleSupplement(date, s.id);
    if (!s.foodId) return;
    const food = CURATED_FOODS.find((f) => f.id === s.foodId);
    toast(wasOn ? `Removed ${s.label.toLowerCase()} from the day's food` : `Logged ${s.label.toLowerCase()} (+${food?.protein ?? 0} g protein)`, {
      label: "Undo",
      run: () => void undo(),
    });
  };

  return { data, toggle };
}

// In-app reminder for today's supplements that aren't ticked yet. Tapping
// one ticks it off. Creatine shows on rest days too.
export function SupplementReminder({ date, training }: { date: string; training: boolean }) {
  const { data, toggle } = useSupplements(date, training);
  if (!data || data.missed.length === 0) return null;

  return (
    <section className="animate-enter card mb-4 p-4" aria-labelledby="supplement-reminder">
      <div className="flex items-start gap-3">
        <Pill size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="supplement-reminder" className="text-sm font-semibold">
            Still to take today
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.missed.map((s) => (
              <button key={s.id} className="chip min-h-11" aria-label={`Mark ${s.label} as taken`} onClick={() => void toggle(s)}>
                <Circle size={16} className="text-faint" />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
