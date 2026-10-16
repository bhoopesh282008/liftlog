"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, Droplet, Minus, Plus } from "lucide-react";
import { useToast } from "@/components/toast";
import { Bar } from "@/components/ui";
import { CURATED_FOODS } from "@/lib/data/indian-foods";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { logFood, mealForNow, remove, updateDay } from "@/lib/repo";

const WHEY_ID = "curated:whey";
const GLASS_ML = 250;

// Quick taps for the daily basics: water, creatine, and a whey scoop
// (which is logged as food so its protein counts).
export function HabitsCard({ date }: { date: string }) {
  const toast = useToast();
  const data = useLiveQuery(async () => {
    const [day, profile, entries] = await Promise.all([
      db.days.get(date),
      db.profile.get(PROFILE_ID),
      db.foodEntries.where("date").equals(date).toArray(),
    ]);
    return {
      water: day && !day.deletedAt ? day.waterGlasses : 0,
      creatine: Boolean(day && !day.deletedAt && day.creatine),
      goal: profile?.waterGoal ?? 12,
      whey: alive(entries)
        .filter((e) => e.foodId === WHEY_ID)
        .reduce((a, e) => a + e.servings, 0),
    };
  }, [date]);
  if (!data) return null;

  const whey = CURATED_FOODS.find((f) => f.id === WHEY_ID);
  const litres = (data.water * GLASS_ML) / 1000;

  return (
    <section className="card mb-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Droplet size={16} className="text-accent" /> Water
        </p>
        <p className="num text-sm">
          <b>{data.water}</b>
          <span className="text-muted">
            {" "}
            / {data.goal} glasses · {Math.round(litres * 100) / 100} L
          </span>
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1">
          <Bar value={data.water} max={data.goal} />
        </div>
        <button
          className="btn btn-icon"
          aria-label="One glass less"
          disabled={data.water === 0}
          onClick={() => void updateDay(date, { waterGlasses: Math.max(0, data.water - 1) })}
        >
          <Minus size={18} />
        </button>
        <button className="btn btn-primary btn-icon" aria-label="Add a glass of water" onClick={() => void updateDay(date, { waterGlasses: data.water + 1 })}>
          <Plus size={18} />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="chip flex-1 justify-center" data-on={data.creatine} onClick={() => void updateDay(date, { creatine: !data.creatine })}>
          {data.creatine && <Check size={16} />} Creatine 5 g
        </button>
        {whey && (
          <button
            className="chip flex-1 justify-center"
            data-on={data.whey > 0}
            onClick={async () => {
              const e = await logFood(whey, 1, mealForNow(), date);
              toast(`Added a whey scoop (+${whey.protein} g protein)`, { label: "Undo", run: () => void remove("foodEntries", e.id) });
            }}
          >
            <Plus size={16} /> Whey scoop{data.whey > 0 && <span className="num opacity-70">× {data.whey}</span>}
          </button>
        )}
      </div>
    </section>
  );
}
