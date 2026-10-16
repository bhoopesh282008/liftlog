"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { LineChart } from "@/components/ui";
import { addDays, dateKey, formatShort, parseKey, weekStart } from "@/lib/dates";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { MUSCLES } from "@/lib/data/exercises";
import {
  adherence,
  dailyTotals,
  estimateMaintenance,
  lastNDays,
  setsPerMuscle,
  targetOn,
  weekStreak,
  weeklyIntake,
  weeklyWeightAverages,
} from "@/lib/progress-logic";
import { proteinStreak } from "@/lib/protein";
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
      muscleOf: new Map(alive(exercises).map((e) => [e.id, e.muscle])),
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

  // Consistency and muscle balance
  const trainedDates = data.workouts.map((w) => w.date);
  const streak = weekStreak(trainedDates, today);
  const thisWeek = data.workouts.filter((w) => w.date >= weekStart(today)).length;
  const muscleSets = setsPerMuscle(data.sets, data.workouts, data.muscleOf, addDays(today, -6), today);

  // Intake
  const totals = dailyTotals(data.entries);
  const intake = weeklyIntake(totals, since, today);
  const maintenance = estimateMaintenance(totals, data.weights, today);

  // Protein, day by day for 4 weeks
  const proteinDays = lastNDays(today, 28)
    .filter((d) => totals.has(d))
    .map((d) => ({ date: d, value: Math.round(totals.get(d)!.protein), goal: targetOn(d, data.targets)?.protein ?? 0 }));
  const proteinHit = proteinDays.filter((p) => p.goal && p.value >= p.goal * 0.95).length;
  const proteinAvg = proteinDays.length ? Math.round(proteinDays.reduce((a, p) => a + p.value, 0) / proteinDays.length) : 0;
  const proteinRun = proteinStreak(totals, data.targets, today);

  return (
    <div className="space-y-4 px-4 pt-5">
      <header>
        <h1 className="text-[30px] leading-tight font-semibold tracking-[-0.02em]">Progress</h1>
        <p className="mt-0.5 text-sm text-muted">Your last {WEEKS} weeks: strength, body weight, and food</p>
      </header>

      <section aria-labelledby="g-strength" className="space-y-3">
        <h2 id="g-strength" className="px-1 pt-4 text-xl font-semibold tracking-[-0.01em]">
          Strength
        </h2>
        <section className="card p-4">
          <h3 className="mb-3 font-semibold">Estimated 1-rep max</h3>
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
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Consistency</h3>
            <span className="num text-xs text-muted">
              {thisWeek} this week{streak > 0 && <> · <b className="text-accent">{streak}-week streak</b></>}
            </span>
          </div>
          <TrainingCalendar dates={new Set(trainedDates)} today={today} />
          <p className="mt-2 text-xs text-faint">Last 16 weeks. A streak counts weeks in a row with 2 or more workouts.</p>
        </section>
        <section className="card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Sets per muscle</h3>
            <span className="text-xs text-muted">Last 7 days</span>
          </div>
          <MuscleBars counts={muscleSets} />
          <p className="mt-3 text-xs text-faint">About 10–20 hard sets a week per muscle (shaded) is a good range for growth.</p>
        </section>
      </section>
      <section aria-labelledby="g-body" className="space-y-3">
        <h2 id="g-body" className="px-1 pt-4 text-xl font-semibold tracking-[-0.01em]">
          Body weight
        </h2>
        <WeighIn latestToday={latest?.date === today ? latest.kg : null} />
        <section className="card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Weekly average</h3>
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
      </section>
      <section aria-labelledby="g-nutrition" className="space-y-3">
        <h2 id="g-nutrition" className="px-1 pt-4 text-xl font-semibold tracking-[-0.01em]">
          Nutrition
        </h2>
        <section className="card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Daily protein</h3>
            <span className="text-xs text-muted">Last 4 weeks, logged days</span>
          </div>
          <LineChart points={proteinDays} goal={current ? { from: current.protein, to: current.protein } : undefined} />
          {proteinDays.length > 0 ? (
            <p className="num mt-2 text-sm text-muted">
              Average <b className="text-text">{proteinAvg} g</b> a day · goal hit on {proteinHit} of {proteinDays.length} logged days
              {proteinRun > 0 && ` · ${proteinRun}-day streak`}
              {current ? ` · goal ${current.protein} g (dashed)` : ""}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">Log food for a few days to see your protein trend.</p>
          )}
        </section>
        <section className="card p-4">
          <h3 className="mb-3 font-semibold">This week&apos;s food</h3>
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
          <p className="mt-1 text-xs text-faint">Top row protein, bottom row calories (within 10%). Outlined days were logged but missed.</p>
        </section>
        <section className="card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Calories eaten</h3>
            <span className="text-xs text-muted">Weekly average of logged days</span>
          </div>
          <LineChart
            points={intake.map((w) => ({ date: w.date, value: w.kcal }))}
            goal={current ? { from: current.calories, to: current.calories } : undefined}
            color="var(--accent)"
          />
          {intake.length > 0 && (
            <p className="num mt-2 text-sm text-muted">
              This week: {intake.at(-1)!.kcal.toLocaleString()} kcal and {intake.at(-1)!.protein} g protein a day
              {current ? ` · target ${current.calories.toLocaleString()} (dashed)` : ""}
            </p>
          )}
          <div className="mt-3 rounded-2xl bg-surface-2 p-3 text-sm">
            {maintenance ? (
              <>
                <p>
                  Your real maintenance is about <b className="num">{maintenance.kcal.toLocaleString()} kcal</b>
                  {current && (
                    <span className="text-muted">
                      {" "}
                      (target is {current.calories >= maintenance.kcal ? "+" : "−"}
                      {Math.abs(current.calories - maintenance.kcal)})
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted">
                  From {maintenance.loggedDays} logged days averaging {maintenance.intake.toLocaleString()} kcal while your weight moved{" "}
                  {maintenance.trend >= 0 ? "+" : ""}
                  {maintenance.trend.toFixed(2)} kg/week. Days you skip logging can make this read low.
                </p>
              </>
            ) : (
              <p className="text-muted">Log food on 10 of the last 21 days and weigh in 4 times to see your real maintenance calories.</p>
            )}
          </div>
        </section>
        {current && (
          <section className="card p-4">
            <h3 className="mb-1 font-semibold">Targets</h3>
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
      </section>
    </div>
  );
}

function Dot({ on, logged, label }: { on: boolean; logged: boolean; label: string }) {
  return (
    <span
      title={label}
      className={`flex size-7 items-center justify-center rounded-full ${on ? "bg-accent text-on-accent" : logged ? "border-[1.5px] border-line-strong" : "bg-surface-2"}`}
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

// GitHub-style grid: one column per week (oldest left), Monday at the top.
function TrainingCalendar({ dates, today }: { dates: Set<string>; today: string }) {
  const weeks = 16;
  const start = addDays(weekStart(today), -(weeks - 1) * 7);
  return (
    <div className="flex gap-[3px]" role="img" aria-label={`Training days over the last ${weeks} weeks`}>
      {Array.from({ length: weeks }, (_, w) => (
        <div key={w} className="flex flex-1 flex-col gap-[3px]">
          {Array.from({ length: 7 }, (_, d) => {
            const day = addDays(start, w * 7 + d);
            const future = day > today;
            return (
              <span
                key={d}
                title={day}
                className={`aspect-square w-full rounded-[3px] ${future ? "bg-transparent" : dates.has(day) ? "bg-accent" : "bg-track"} ${day === today ? "ring-1 ring-text/40" : ""}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MuscleBars({ counts }: { counts: Map<string, number> }) {
  const max = 24;
  return (
    <ul className="space-y-2.5">
      {MUSCLES.map((m) => {
        const n = counts.get(m) ?? 0;
        const low = n < 10;
        return (
          <li key={m} className="flex items-center gap-3 text-sm">
            <span className="w-20 shrink-0">{m}</span>
            <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-track">
              <span className="absolute inset-y-0 bg-accent-soft" style={{ left: `${(10 / max) * 100}%`, width: `${(10 / max) * 100}%` }} />
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                style={{ width: `${Math.min(100, (n / max) * 100)}%`, background: low ? "var(--faint)" : "var(--accent)" }}
              />
            </span>
            <span className={`num w-14 shrink-0 text-right ${low ? "text-muted" : ""}`}>
              {n}
              {low && " · low"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
