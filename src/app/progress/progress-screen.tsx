"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { LineChart } from "@/components/ui";
import { addDays, dateKey, formatShort, parseKey } from "@/lib/dates";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { adherence, lastNDays, weeklyWeightAverages } from "@/lib/progress-logic";
import { logWeight } from "@/lib/repo";
import { targetWeeklyGainKg, weeklyTrendKg } from "@/lib/targets";
import { e1rm, e1rmHistory, formatKg } from "@/lib/workout-logic";

const WEEKS = 8;

export function ProgressScreen() {
  const today = dateKey();
  const since = addDays(today, -WEEKS * 7);
  const data = useLiveQuery(async () => {
    const [weights, workouts, sets, exercises, entries, targets, profile] = await Promise.all([
      db.weights.toArray(),
      db.workouts.toArray(),
      db.sets.toArray(),
      db.exercises.toArray(),
      db.foodEntries.where("date").aboveOrEqual(addDays(dateKey(), -WEEKS * 7)).toArray(),
      db.targets.toArray(),
      db.profile.get(PROFILE_ID),
    ]);
    return {
      weights: alive(weights).sort((a, b) => a.date.localeCompare(b.date)),
      workouts: alive(workouts),
      sets: alive(sets),
      exercises: new Map(alive(exercises).map((e) => [e.id, e.name])),
      entries: alive(entries),
      targets: alive(targets).sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt),
      pace: profile?.pace ?? "standard",
    };
  }, []);

  const [lift, setLift] = useState<string | null>(null);

  const lifts = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    const workoutIds = new Set(data.workouts.map((w) => w.id));
    for (const s of data.sets) if (workoutIds.has(s.workoutId)) counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  }, [data]);

  if (!data) return null;

  // Body weight
  const recentWeights = data.weights.filter((w) => w.date >= since);
  const weekly = weeklyWeightAverages(recentWeights);
  const trendWindow = data.weights.filter((w) => w.date >= addDays(today, -28));
  const trend = trendWindow.length >= 3 ? weeklyTrendKg(trendWindow) : null;
  const latest = data.weights.at(-1);
  const goalPerWeek = latest ? targetWeeklyGainKg(latest.kg, data.pace) : 0;
  const status =
    trend === null ? null : Math.abs(trend - goalPerWeek) <= Math.max(0.1, goalPerWeek * 0.5) ? "on pace" : trend < goalPerWeek ? "below pace" : "above pace";
  const goalLine = weekly.length >= 2 ? { from: weekly[0].value, to: weekly[0].value + goalPerWeek * (weekly.length - 1) } : undefined;

  // Strength
  const selected = lift && lifts.includes(lift) ? lift : lifts[0];
  const history = selected ? e1rmHistory(selected, data.workouts, data.sets).filter((p) => p.date >= since) : [];
  const bestSetIn = (fromDate: string, last: boolean) => {
    const ids = data.workouts
      .filter((w) => w.date >= fromDate && data.sets.some((s) => s.workoutId === w.id && s.exerciseId === selected))
      .sort((a, b) => a.startedAt - b.startedAt);
    const w = last ? ids.at(-1) : ids[0];
    if (!w) return null;
    return data.sets
      .filter((s) => s.workoutId === w.id && s.exerciseId === selected)
      .sort((a, b) => e1rm(b.weightKg, b.reps) - e1rm(a.weightKg, a.reps))[0];
  };
  const firstBest = selected ? bestSetIn(since, false) : null;
  const lastBest = selected ? bestSetIn(since, true) : null;

  // Nutrition
  const week = adherence(lastNDays(today, 7), data.entries, data.targets);
  const proteinHits = week.filter((d) => d.proteinHit).length;
  const calorieHits = week.filter((d) => d.caloriesHit).length;
  const current = data.targets.at(-1);

  return (
    <div className="space-y-4 px-4 pt-5">
      <header>
        <p className="label">Last {WEEKS} weeks</p>
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Progress</h1>
      </header>

      <WeighIn latestToday={latest?.date === today ? latest.kg : null} />

      <section className="card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">Body weight</h2>
          {status && (
            <span className={`text-xs font-semibold ${status === "on pace" ? "text-accent" : "text-pr"}`}>
              {trend! >= 0 ? "+" : ""}
              {trend!.toFixed(2)} kg/wk · {status}
            </span>
          )}
        </div>
        <LineChart points={weekly} goal={goalLine} />
        <p className="num mt-2 text-sm text-muted">
          {weekly.length >= 2
            ? `${weekly[0].value.toFixed(1)} → ${weekly.at(-1)!.value.toFixed(1)} kg weekly average · goal +${goalPerWeek.toFixed(2)} kg/wk (dashed)`
            : "Weigh in a few mornings a week. Weekly averages smooth out water swings."}
        </p>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Strength</h2>
        {lifts.length === 0 ? (
          <p className="text-sm text-muted">Finish a workout to start tracking your lifts.</p>
        ) : (
          <>
            <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
              {lifts.map((id) => (
                <button key={id} className="chip" data-on={id === selected} onClick={() => setLift(id)}>
                  {data.exercises.get(id) ?? "Exercise"}
                </button>
              ))}
            </div>
            <LineChart points={history} color="var(--pr)" />
            <p className="num mt-2 text-sm text-muted">
              {firstBest && lastBest
                ? `Best set ${formatKg(firstBest.weightKg)} × ${firstBest.reps} → ${formatKg(lastBest.weightKg)} × ${lastBest.reps} · est. 1-rep max ${history.at(-1)?.value ?? 0} kg`
                : ""}
            </p>
          </>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">This week&apos;s food</h2>
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {week.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <span className="text-[11px] text-faint">{parseKey(d.date).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
              <Dot on={d.proteinHit} logged={d.logged} label="Protein" />
              <Dot on={d.caloriesHit} logged={d.logged} label="Calories" />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <span>
            Protein target hit <b className="num">{proteinHits} of 7</b> days
          </span>
          <span className="text-muted">
            Calories <b className="num">{calorieHits}/7</b>
          </span>
        </div>
        <p className="mt-1 text-xs text-faint">Top row protein, bottom row calories (within 10%).</p>
      </section>

      {current && (
        <section className="card p-4">
          <h2 className="mb-1 font-semibold">Targets</h2>
          <p className="num text-sm">
            {current.calories.toLocaleString()} kcal · {current.protein} g protein · {current.carbs} g carbs · {current.fat} g fat
          </p>
          <ul className="mt-3 space-y-2">
            {[...data.targets].reverse().slice(0, 5).map((t) => (
              <li key={t.id} className="text-sm">
                <span className="num text-muted">{formatShort(t.date)} · {t.calories.toLocaleString()} kcal</span>
                <p className="text-xs text-faint">{t.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Dot({ on, logged, label }: { on: boolean; logged: boolean; label: string }) {
  return (
    <span
      title={label}
      className={`flex size-7 items-center justify-center rounded-full ${on ? "bg-accent text-on-accent" : logged ? "bg-pr-soft" : "bg-surface-2"}`}
    >
      {on && <Check size={14} strokeWidth={3} />}
    </span>
  );
}

function WeighIn({ latestToday }: { latestToday: number | null }) {
  const [value, setValue] = useState("");
  const toast = useToast();
  const kg = parseFloat(value.replace(",", "."));
  const valid = Number.isFinite(kg) && kg > 25 && kg < 300;
  return (
    <form
      className="card flex items-center gap-3 p-3 pl-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        await logWeight(Math.round(kg * 10) / 10);
        setValue("");
        toast("Weight saved");
      }}
    >
      <div className="flex-1">
        <p className="text-sm font-semibold">Today&apos;s weight</p>
        <p className="text-xs text-muted">{latestToday ? `Logged ${latestToday} kg. Enter again to replace.` : "Best first thing in the morning"}</p>
      </div>
      <input
        className="input num w-24 text-center"
        inputMode="decimal"
        placeholder="kg"
        aria-label="Weight in kg"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="btn btn-primary" disabled={!valid} type="submit">
        Save
      </button>
    </form>
  );
}
