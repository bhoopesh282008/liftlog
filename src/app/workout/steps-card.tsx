"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Footprints, Pencil } from "lucide-react";
import { useState } from "react";
import { Bar, Sheet } from "@/components/ui";
import { addDays, parseKey } from "@/lib/dates";
import { db, PROFILE_ID } from "@/lib/db";
import { saveSteps } from "@/lib/repo";
import { DEFAULT_STEP_GOAL, parseSteps, stepsKcal, weekSteps } from "@/lib/steps";

const fmt = (n: number) => n.toLocaleString("en-IN");

// The day's steps against the goal, with the week as small bars. Steps come
// from typing them in, or from the iPhone Shortcut (Settings → Steps).
export function StepsCard({ date, weightKg }: { date: string; weightKg: number | null }) {
  const [editing, setEditing] = useState(false);
  const data = useLiveQuery(async () => {
    const [days, profile] = await Promise.all([db.days.where("date").between(addDays(date, -6), date, true, true).toArray(), db.profile.get(PROFILE_ID)]);
    return { week: weekSteps(days, date), goal: profile?.stepGoal ?? DEFAULT_STEP_GOAL };
  }, [date]);
  if (!data) return null;

  const today = data.week[6].steps;
  const peak = Math.max(data.goal, ...data.week.map((d) => d.steps));
  return (
    <section className="card mb-4 p-4" aria-labelledby="steps-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="steps-title" className="flex items-center gap-2 text-sm font-medium">
            <Footprints size={16} className="text-muted" aria-hidden /> Steps
          </p>
          <p className="mt-1 leading-none">
            <span className="num font-display text-[34px] font-bold">{fmt(today)}</span>
            <span className="ml-1.5 text-sm text-muted">/ {fmt(data.goal)}</span>
          </p>
          {today > 0 && weightKg ? <p className="num mt-1 text-xs text-muted">≈ {stepsKcal(today, weightKg)} kcal walked</p> : null}
        </div>
        <button className="btn btn-icon" aria-label={today ? "Edit steps" : "Add steps"} onClick={() => setEditing(true)}>
          <Pencil size={17} />
        </button>
      </div>
      <div className="mt-3">
        <Bar value={today} max={data.goal} />
      </div>
      <div className="mt-3 flex h-12 items-end gap-1.5" role="img" aria-label={`Last 7 days: ${data.week.map((d) => fmt(d.steps)).join(", ")} steps`}>
        {data.week.map((d, i) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-2.5 rounded-full transition-[height] duration-300 ${d.steps >= data.goal ? "bg-accent" : i === 6 ? "bg-accent/60" : "bg-line-strong"}`}
              style={{ height: `${Math.max(4, (d.steps / peak) * 36)}px` }}
            />
            <span className="text-[10px] text-faint">{parseKey(d.date).toLocaleDateString("en-IN", { weekday: "narrow" })}</span>
          </div>
        ))}
      </div>
      <StepsSheet open={editing} onClose={() => setEditing(false)} date={date} current={today} />
    </section>
  );
}

function StepsSheet({ open, onClose, date, current }: { open: boolean; onClose: () => void; date: string; current: number }) {
  const [value, setValue] = useState("");
  const steps = parseSteps(value);
  return (
    <Sheet open={open} onClose={onClose} title="Steps today">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (steps === null) return;
          await saveSteps(date, steps);
          setValue("");
          onClose();
        }}
      >
        <label className="label mb-1 block" htmlFor="steps-input">
          Total steps for the day (from the Health app)
        </label>
        <input
          id="steps-input"
          name="steps"
          className="input num text-lg"
          inputMode="numeric"
          autoComplete="off"
          placeholder={current ? fmt(current) : "e.g. 8,500"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn btn-primary mt-3 w-full" type="submit" disabled={steps === null}>
          Save steps
        </button>
        <p className="mt-3 text-xs text-muted">Tip: set up the iPhone Shortcut in Settings → Steps to send them in one tap.</p>
      </form>
    </Sheet>
  );
}
