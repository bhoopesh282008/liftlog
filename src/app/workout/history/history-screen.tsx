"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, CalendarPlus, ChevronRight, History, Plus, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ExercisePicker } from "@/components/exercise-picker";
import { type Editing, SetSheet, showKg } from "@/components/set-sheet";
import { useToast } from "@/components/toast";
import { Empty, Sheet } from "@/components/ui";
import { addDays, dateKey, formatDay, parseKey } from "@/lib/dates";
import { alive, db } from "@/lib/db";
import { addHistorySet, backfillWorkout, deleteHistorySet, deleteWorkout, editHistorySet, moveWorkout, save } from "@/lib/repo";
import type { SplitDay, Workout, WorkoutSet } from "@/lib/types";

const volume = (sets: WorkoutSet[]) => Math.round(sets.reduce((a, s) => a + s.weightKg * s.reps, 0));

export function HistoryScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const data = useLiveQuery(async () => {
    const [workouts, sets, exercises, days] = await Promise.all([
      db.workouts.toArray(),
      db.sets.toArray(),
      db.exercises.toArray(),
      db.splitDays.toArray(),
    ]);
    const bySession = new Map<string, WorkoutSet[]>();
    for (const s of alive(sets)) bySession.set(s.workoutId, [...(bySession.get(s.workoutId) ?? []), s]);
    return {
      workouts: alive(workouts).sort((a, b) => b.startedAt - a.startedAt),
      bySession,
      names: new Map(alive(exercises).map((e) => [e.id, e.name])),
      days: alive(days).sort((a, b) => a.order - b.order),
    };
  }, []);

  if (!data) return null;
  const selected = data.workouts.find((w) => w.id === selectedId);

  if (selected) {
    return (
      <WorkoutDetail
        workout={selected}
        sets={data.bySession.get(selected.id) ?? []}
        names={data.names}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const months = new Map<string, Workout[]>();
  for (const w of data.workouts) {
    const key = parseKey(w.date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    months.set(key, [...(months.get(key) ?? []), w]);
  }

  return (
    <div className="px-4 pt-3">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/workout" className="btn btn-ghost btn-icon -ml-2" aria-label="Back to workout">
          <ArrowLeft size={20} />
        </Link>
        <button className="btn btn-ghost text-sm" onClick={() => setBackfilling(true)}>
          <CalendarPlus size={18} /> Log past workout
        </button>
      </div>
      <h1 className="mb-4 text-[28px] leading-tight font-semibold tracking-tight">History</h1>

      {data.workouts.length === 0 ? (
        <Empty
          icon={<History size={22} />}
          title="No workouts yet"
          body="Finished sessions show up here. Did one on paper? Log it as a past workout."
        />
      ) : (
        [...months.entries()].map(([month, list]) => (
          <section key={month} className="mb-4">
            <h2 className="label mb-1.5 px-1">{month}</h2>
            <ul className="card divide-y divide-line overflow-hidden">
              {list.map((w) => {
                const sets = data.bySession.get(w.id) ?? [];
                const prs = sets.filter((s) => s.pr).length;
                const minutes = w.finishedAt ? Math.round((w.finishedAt - w.startedAt) / 60_000) : null;
                return (
                  <li key={w.id}>
                    <button className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2" onClick={() => setSelectedId(w.id)}>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {w.splitDayName}
                          {!w.finishedAt && <span className="ml-2 text-xs font-normal text-accent">In progress</span>}
                        </span>
                        <span className="num block text-sm text-muted">
                          {formatDay(w.date)} · {sets.length} {sets.length === 1 ? "set" : "sets"} · {volume(sets).toLocaleString()} kg
                          {minutes !== null && minutes < 300 ? ` · ${minutes} min` : ""}
                        </span>
                      </span>
                      {prs > 0 && (
                        <span className="num flex items-center gap-1 rounded-full bg-pr-soft px-2 py-0.5 text-xs font-semibold text-pr">
                          <Trophy size={12} /> {prs}
                        </span>
                      )}
                      <ChevronRight size={18} className="text-faint" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <BackfillSheet
        open={backfilling}
        days={data.days}
        onClose={() => setBackfilling(false)}
        onCreate={async (date, day) => {
          const w = await backfillWorkout(date, day);
          setBackfilling(false);
          setSelectedId(w.id);
        }}
      />
    </div>
  );
}

function WorkoutDetail({ workout, sets, names, onBack }: { workout: Workout; sets: WorkoutSet[]; names: Map<string, string>; onBack: () => void }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [picking, setPicking] = useState(false);
  const toast = useToast();

  const exerciseIds = [...new Set([...[...sets].sort((a, b) => a.loggedAt - b.loggedAt).map((s) => s.exerciseId), ...workout.extraExerciseIds])];

  return (
    <div className="px-4 pt-3">
      <div className="mb-3 flex items-center justify-between">
        <button className="btn btn-ghost btn-icon -ml-2" onClick={onBack} aria-label="Back to history">
          <ArrowLeft size={20} />
        </button>
        <button
          className="btn btn-ghost text-sm text-danger"
          onClick={async () => {
            const undo = await deleteWorkout(workout);
            onBack();
            toast("Workout deleted", { label: "Undo", run: () => void undo() });
          }}
        >
          <Trash2 size={16} /> Delete
        </button>
      </div>
      <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{workout.splitDayName}</h1>
      <label className="mt-2 mb-5 flex items-center gap-2 text-sm text-muted">
        Date
        <input
          type="date"
          className="input num min-h-10 w-auto"
          value={workout.date}
          max={dateKey()}
          onChange={(e) => e.target.value && void moveWorkout(workout, e.target.value)}
        />
      </label>

      <div className="space-y-3">
        {exerciseIds.map((exerciseId) => {
          const list = sets.filter((s) => s.exerciseId === exerciseId).sort((a, b) => a.order - b.order);
          const prev = list[list.length - 1];
          return (
            <section key={exerciseId} className="card p-4">
              <h2 className="font-semibold">{names.get(exerciseId) ?? "Exercise"}</h2>
              <ul className="mt-2 divide-y divide-line">
                {list.map((s, i) => (
                  <li key={s.id}>
                    <button
                      className="flex min-h-12 w-full items-center justify-between text-left"
                      onClick={() => setEditing({ exerciseId, set: s, weightKg: s.weightKg, reps: s.reps })}
                    >
                      <span className="num">
                        <span className="mr-3 inline-block w-10 text-faint">Set {i + 1}</span>
                        {showKg(s.weightKg)} × {s.reps}
                      </span>
                      {s.pr && (
                        <span className="flex items-center gap-1 rounded-full bg-pr-soft px-2.5 py-1 text-xs font-semibold text-pr">
                          <Trophy size={13} /> PR
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="mt-1 flex min-h-10 items-center gap-1 text-sm text-muted"
                onClick={() => setEditing({ exerciseId, weightKg: prev?.weightKg ?? 0, reps: prev?.reps ?? 8 })}
              >
                <Plus size={16} /> Add set
              </button>
            </section>
          );
        })}
      </div>

      <button className="btn mt-4 w-full" onClick={() => setPicking(true)}>
        <Plus size={18} /> Add exercise
      </button>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          if (!workout.extraExerciseIds.includes(id)) void save("workouts", { ...workout, extraExerciseIds: [...workout.extraExerciseIds, id] });
        }}
      />
      <SetSheet
        editing={editing}
        name={editing ? (names.get(editing.exerciseId) ?? "") : ""}
        onClose={() => setEditing(null)}
        onSave={async (e) => {
          if (e.set) await editHistorySet(e.set, e.weightKg, e.reps);
          else await addHistorySet(workout, e.exerciseId, e.weightKg, e.reps);
          setEditing(null);
        }}
        onDelete={async (s) => {
          await deleteHistorySet(s);
          setEditing(null);
        }}
      />
    </div>
  );
}

function BackfillSheet({
  open,
  days,
  onClose,
  onCreate,
}: {
  open: boolean;
  days: SplitDay[];
  onClose: () => void;
  onCreate: (date: string, day: SplitDay | null) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Log a past workout">
      <BackfillForm days={days} onCreate={onCreate} />
    </Sheet>
  );
}

function BackfillForm({ days, onCreate }: { days: SplitDay[]; onCreate: (date: string, day: SplitDay | null) => void }) {
  const [date, setDate] = useState(() => addDays(dateKey(), -1));
  const [dayId, setDayId] = useState<string | null>(days[0]?.id ?? null);
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="label mb-1.5 block">When</span>
        <input type="date" className="input num" value={date} max={dateKey()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div>
        <p className="label mb-1.5">Which day</p>
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <button key={d.id} className="chip" data-on={dayId === d.id} onClick={() => setDayId(d.id)}>
              {d.name}
            </button>
          ))}
          <button className="chip" data-on={dayId === null} onClick={() => setDayId(null)}>
            Other
          </button>
        </div>
      </div>
      <p className="text-sm text-muted">You&apos;ll add the exercises and sets next. Past workouts don&apos;t change which day is next in your rotation.</p>
      <button className="btn btn-primary w-full" disabled={!date} onClick={() => onCreate(date, days.find((d) => d.id === dayId) ?? null)}>
        Continue
      </button>
    </div>
  );
}
