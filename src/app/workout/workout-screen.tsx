"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight, Dumbbell, Plus, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExercisePicker } from "@/components/exercise-picker";
import { mmss, useRestTimer } from "@/components/rest-timer";
import { useToast } from "@/components/toast";
import { Empty, Sheet, Stepper } from "@/components/ui";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { finishWorkout, logSet, remove, save, startWorkout, updateSet } from "@/lib/repo";
import type { Exercise, PlannedExercise, SplitDay, Workout, WorkoutSet } from "@/lib/types";
import { formatSets, lastSessionSets, nextSplitDay, suggestSet } from "@/lib/workout-logic";

const showKg = (kg: number) => (kg === 0 ? "BW" : `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`);

interface Editing {
  exerciseId: string;
  set?: WorkoutSet;
  weightKg: number;
  reps: number;
}

export function WorkoutScreen() {
  const data = useLiveQuery(async () => {
    const [days, workouts, sets, exercises, profile] = await Promise.all([
      db.splitDays.toArray(),
      db.workouts.toArray(),
      db.sets.toArray(),
      db.exercises.toArray(),
      db.profile.get(PROFILE_ID),
    ]);
    return {
      days: alive(days).sort((a, b) => a.order - b.order),
      workouts: alive(workouts),
      sets: alive(sets),
      exercises: new Map(alive(exercises).map((e) => [e.id, e])),
      restSeconds: profile?.restSeconds ?? 120,
    };
  }, []);

  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [picking, setPicking] = useState(false);
  const timer = useRestTimer();
  const toast = useToast();

  const active = useMemo(
    () => data?.workouts.filter((w) => !w.finishedAt).sort((a, b) => b.startedAt - a.startedAt)[0],
    [data],
  );
  const suggested = useMemo(() => (data ? nextSplitDay(data.days, data.workouts) : null), [data]);

  if (!data) return null;
  const { days, workouts, sets, exercises, restSeconds } = data;

  const day: SplitDay | null = active
    ? (days.find((d) => d.id === active.splitDayId) ?? null)
    : (days.find((d) => d.id === pickedDayId) ?? suggested);

  const sessionSets = active ? sets.filter((s) => s.workoutId === active.id) : [];
  const plan: PlannedExercise[] = [...(day?.exercises ?? [])];
  const extraIds = [...(active?.extraExerciseIds ?? []), ...sessionSets.map((s) => s.exerciseId)];
  for (const id of extraIds) {
    if (!plan.some((p) => p.exerciseId === id)) plan.push({ exerciseId: id, sets: 3, repMin: 8, repMax: 12 });
  }

  const currentIdx = plan.findIndex((p) => sessionSets.filter((s) => s.exerciseId === p.exerciseId).length < p.sets);

  const ensureWorkout = async (): Promise<Workout> => active ?? (await startWorkout(day));

  const commit = async (exerciseId: string, weightKg: number, reps: number) => {
    const w = await ensureWorkout();
    const set = await logSet(w, exerciseId, weightKg, reps);
    timer.start(restSeconds);
    const name = exercises.get(exerciseId)?.name ?? "Exercise";
    if (set.pr) toast(`New PR · ${name} ${showKg(weightKg)} × ${reps}`);
    else toast(`Logged ${showKg(weightKg)} × ${reps}`, { label: "Undo", run: () => void remove("sets", set.id) });
  };

  const finish = async () => {
    if (!active) return;
    const done = await finishWorkout(active);
    timer.stop();
    const prs = sessionSets.filter((s) => s.pr).length;
    toast(`Workout saved${prs ? ` · ${prs} PR${prs > 1 ? "s" : ""}` : ""}`, {
      label: "Undo",
      run: () => void save("workouts", { ...done, finishedAt: null }),
    });
    setPickedDayId(null);
  };

  const discard = async () => {
    if (!active) return;
    for (const s of sessionSets) await remove("sets", s.id);
    await remove("workouts", active.id);
    timer.stop();
  };

  if (days.length === 0 && !active) {
    return (
      <Empty
        icon={<Dumbbell size={22} />}
        title="Set up your split"
        body="Add the days you train and the exercises for each, and they'll be ready here every session."
        action={
          <Link href="/settings/split" className="btn btn-primary">
            Set up split
          </Link>
        }
      />
    );
  }

  const nextNames = plan
    .slice(currentIdx + 1)
    .map((p) => exercises.get(p.exerciseId)?.name)
    .filter(Boolean);

  return (
    <div className="px-4 pt-5">
      <header className="mb-4">
        <p className="label">{active ? <Elapsed since={active.startedAt} /> : day?.id === suggested?.id ? "Next in your rotation" : "Picked for today"}</p>
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{day?.name ?? active?.splitDayName ?? "Workout"}</h1>
      </header>

      {!active && days.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
          {days.map((d) => (
            <button key={d.id} className="chip" data-on={d.id === day?.id} onClick={() => setPickedDayId(d.id)}>
              {d.name}
              {d.id === suggested?.id && <span className="text-[11px] opacity-70">next</span>}
            </button>
          ))}
        </div>
      )}

      <RestCard />

      <div className="space-y-3">
        {plan.map((p, i) => {
          const ex = exercises.get(p.exerciseId);
          if (!ex) return null;
          const done = sessionSets.filter((s) => s.exerciseId === p.exerciseId).sort((a, b) => a.order - b.order);
          const last = lastSessionSets(p.exerciseId, active?.id ?? null, workouts, sets);
          return (
            <ExerciseCard
              key={p.exerciseId}
              exercise={ex}
              plan={p}
              done={done}
              last={last}
              current={i === currentIdx}
              onLog={(w, r) => commit(p.exerciseId, w, r)}
              onEdit={(e) => setEditing(e)}
            />
          );
        })}
      </div>

      {currentIdx >= 0 && nextNames.length > 0 && (
        <p className="mt-4 px-1 text-sm text-muted">Next: {nextNames.join(", ")}</p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button className="btn w-full" onClick={() => setPicking(true)}>
          <Plus size={18} /> Add exercise
        </button>
        {active && (
          <>
            <button className="btn btn-primary w-full" onClick={finish}>
              <Check size={18} /> Finish workout
            </button>
            {sessionSets.length === 0 && (
              <button className="btn btn-ghost w-full" onClick={discard}>
                Discard empty workout
              </button>
            )}
          </>
        )}
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={async (id) => {
          const w = await ensureWorkout();
          if (!w.extraExerciseIds.includes(id)) await save("workouts", { ...w, extraExerciseIds: [...w.extraExerciseIds, id] });
        }}
      />

      <SetSheet
        editing={editing}
        name={editing ? (exercises.get(editing.exerciseId)?.name ?? "") : ""}
        onClose={() => setEditing(null)}
        onSave={async (e) => {
          if (e.set) await updateSet(e.set, e.weightKg, e.reps);
          else await commit(e.exerciseId, e.weightKg, e.reps);
          setEditing(null);
        }}
        onDelete={async (s) => {
          await remove("sets", s.id);
          setEditing(null);
        }}
      />
    </div>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const min = Math.max(0, Math.floor((now - since) / 60_000));
  return <>In progress · {min} min</>;
}

function ExerciseCard({
  exercise,
  plan,
  done,
  last,
  current,
  onLog,
  onEdit,
}: {
  exercise: Exercise;
  plan: PlannedExercise;
  done: WorkoutSet[];
  last: WorkoutSet[];
  current: boolean;
  onLog: (weightKg: number, reps: number) => void;
  onEdit: (e: Editing) => void;
}) {
  const pendingCount = Math.max(plan.sets - done.length, 0);
  const complete = pendingCount === 0 && done.length > 0;
  const range = plan.repMin === plan.repMax ? `${plan.repMin}` : `${plan.repMin}–${plan.repMax}`;

  return (
    <section
      className={`card p-4 transition-[border-color] duration-200 ${current ? "border-line-strong" : ""}`}
      aria-current={current ? "step" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{exercise.name}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {last.length ? <>Last time: <span className="num">{formatSets(last).replace(/^0 kg/, "BW")}</span></> : "First time: set a baseline"}
          </p>
        </div>
        <span className={`num shrink-0 text-xs ${complete ? "text-accent" : "text-faint"}`}>
          {complete ? <Check size={18} /> : `${plan.sets} × ${range}`}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-line">
        {done.map((s, i) => (
          <li key={s.id}>
            <button
              className="flex min-h-12 w-full items-center justify-between text-left"
              onClick={() => onEdit({ exerciseId: s.exerciseId, set: s, weightKg: s.weightKg, reps: s.reps })}
            >
              <span className="num">
                <span className="mr-3 inline-block w-10 text-faint">Set {i + 1}</span>
                {showKg(s.weightKg)} × {s.reps}
              </span>
              {s.pr ? (
                <span className="animate-pop flex items-center gap-1 rounded-full bg-pr-soft px-2.5 py-1 text-xs font-semibold text-pr">
                  <Trophy size={13} /> New PR
                </span>
              ) : (
                <Check size={18} className="text-accent" />
              )}
            </button>
          </li>
        ))}
        {Array.from({ length: pendingCount }, (_, k) => {
          const idx = done.length + k;
          const s = suggestSet(idx, done, last, plan.repMin);
          const first = k === 0;
          return (
            <li key={`p${k}`} className={`flex min-h-12 items-center justify-between ${first ? "" : "opacity-45"}`}>
              <button
                className="num -ml-1 min-h-11 rounded-lg px-1 text-left"
                onClick={() => onEdit({ exerciseId: exercise.id, weightKg: s?.weightKg ?? 0, reps: s?.reps ?? plan.repMin })}
                aria-label="Change weight and reps"
              >
                <span className="mr-3 inline-block w-10 text-faint">Set {idx + 1}</span>
                {s && (last.length || done.length) ? (
                  <span className="border-b border-dashed border-line-strong">
                    {showKg(s.weightKg)} × {s.reps}
                  </span>
                ) : s ? (
                  <span className="border-b border-dashed border-line-strong text-muted">Enter weight × {s.reps}</span>
                ) : (
                  <span className="text-faint">Tap to enter</span>
                )}
              </button>
              {first && (
                <button
                  className="btn btn-primary min-h-10 px-5 text-sm"
                  onClick={() =>
                    s && (last.length || done.length) ? onLog(s.weightKg, s.reps) : onEdit({ exerciseId: exercise.id, weightKg: s?.weightKg ?? 0, reps: s?.reps ?? plan.repMin })
                  }
                >
                  Log
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {pendingCount === 0 && (
        <button
          className="mt-1 flex min-h-10 items-center gap-1 text-sm text-muted"
          onClick={() => {
            const prev = done[done.length - 1];
            onEdit({ exerciseId: exercise.id, weightKg: prev?.weightKg ?? 0, reps: prev?.reps ?? plan.repMin });
          }}
        >
          <Plus size={16} /> Add set
        </button>
      )}
    </section>
  );
}

function RestCard() {
  const t = useRestTimer();
  if (!t.endAt && !t.justFinished) return null;
  const pct = t.total ? (t.remaining / t.total) * 100 : 0;
  return (
    <div className="card animate-enter mb-3 overflow-hidden p-4" role="timer" aria-live="off">
      <div className="flex items-center justify-between">
        <div>
          <p className="label">{t.endAt ? "Rest" : "Rest done"}</p>
          <p className={`num text-4xl font-semibold tracking-tight ${t.endAt ? "" : "text-accent"}`}>{t.endAt ? mmss(t.remaining) : "Go"}</p>
        </div>
        {t.endAt && (
          <div className="flex gap-1.5">
            <button className="btn btn-icon num text-sm" onClick={() => t.add(-15)} aria-label="15 seconds less">
              −15
            </button>
            <button className="btn btn-icon num text-sm" onClick={() => t.add(15)} aria-label="15 seconds more">
              +15
            </button>
            <button className="btn text-sm" onClick={t.stop}>
              Skip <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SetSheet({
  editing,
  name,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Editing | null;
  name: string;
  onClose: () => void;
  onSave: (e: Editing) => void;
  onDelete: (s: WorkoutSet) => void;
}) {
  return (
    <Sheet open={!!editing} onClose={onClose} title={name}>
      {editing && <SetForm editing={editing} onSave={onSave} onDelete={onDelete} />}
    </Sheet>
  );
}

function SetForm({ editing, onSave, onDelete }: { editing: Editing; onSave: (e: Editing) => void; onDelete: (s: WorkoutSet) => void }) {
  const [weight, setWeight] = useState(editing.weightKg);
  const [reps, setReps] = useState(editing.reps);
  return (
        <div className="space-y-4">
          <div>
            <p className="label mb-1.5">Weight (kg, 0 for bodyweight)</p>
            <Stepper label="weight" value={weight} step={2.5} onChange={setWeight} format={(v) => String(v)} />
          </div>
          <div>
            <p className="label mb-1.5">Reps</p>
            <Stepper label="reps" value={reps} step={1} onChange={(v) => setReps(Math.round(v))} />
          </div>
          <button className="btn btn-primary w-full" disabled={reps <= 0} onClick={() => onSave({ ...editing, weightKg: weight, reps })}>
            {editing.set ? "Save set" : "Log set"}
          </button>
          {editing.set && (
            <button className="btn btn-ghost w-full text-danger" onClick={() => onDelete(editing.set!)}>
              <Trash2 size={16} /> Delete set
            </button>
          )}
        </div>
  );
}
