"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronDown, Dumbbell, History, Plus, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ClickSpark from "@/components/react-bits/ClickSpark";
import ShinyText from "@/components/react-bits/ShinyText";
import { ExercisePicker } from "@/components/exercise-picker";
import { useRestTimer } from "@/components/rest-timer";
import { SendToObsidian, useObsidianEnabled } from "@/components/send-to-obsidian";
import { useToast } from "@/components/toast";
import { type Editing, SetSheet, showKg } from "@/components/set-sheet";
import { Empty } from "@/components/ui";
import { useTokenColor } from "@/lib/use-token";
import { MUSCLE_DAYS, muscleDay } from "@/lib/data/muscle-routines";
import { addDays, dateKey } from "@/lib/dates";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { setsPerMuscle } from "@/lib/progress-logic";
import { finishWorkout, logSet, remove, save, startWorkout, updateSet } from "@/lib/repo";
import type { Exercise, PlannedExercise, SplitDay, Workout, WorkoutSet } from "@/lib/types";
import { formatSets, nextSplitDay, planProgression, previousSessions, type Progression, suggestSet } from "@/lib/workout-logic";


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
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
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
    ? (days.find((d) => d.id === active.splitDayId) ?? muscleDay(active.splitDayId) ?? null)
    : (days.find((d) => d.id === pickedDayId) ?? muscleDay(pickedDayId) ?? suggested);
  const isMuscleDay = Boolean(muscleDay(day?.id));
  const today = dateKey();
  const muscleOf = new Map([...exercises.values()].map((e) => [e.id, e.muscle]));
  const weekSets = setsPerMuscle(sets, workouts, muscleOf, addDays(today, -6), today);

  const muscleChips = !active && (
    <section className="mb-4" aria-label="Train one muscle">
      <p className="mb-2 px-1 text-sm text-muted">Or train one muscle. Sets in the last 7 days:</p>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {MUSCLE_DAYS.map((d) => {
          const muscle = d.name.replace(" day", "");
          const n = weekSets.get(muscle) ?? 0;
          return (
            <button key={d.id} className="chip" data-on={d.id === day?.id} onClick={() => setPickedDayId(d.id)}>
              {muscle}
              <span className={`num text-xs ${n < 10 ? "text-faint" : "opacity-70"}`}>{n}</span>
            </button>
          );
        })}
      </div>
    </section>
  );

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

  if (days.length === 0 && !active && !isMuscleDay) {
    return (
      <div className="px-4">
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
        {muscleChips}
      </div>
    );
  }

  const nextNames = plan
    .slice(currentIdx + 1)
    .map((p) => exercises.get(p.exerciseId)?.name)
    .filter(Boolean);

  return (
    <div className="px-4 pt-5">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="title">{day?.name ?? active?.splitDayName ?? "Workout"}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {active ? (
              <Elapsed since={active.startedAt} />
            ) : isMuscleDay ? (
              "Muscle focus, your rotation stays put"
            ) : day?.id === suggested?.id ? (
              "Next in your rotation"
            ) : (
              "Picked for today"
            )}
            {plan.length > 0 && ` · ${plan.length} exercises`}
          </p>
        </div>
        <Link href="/workout/history" className="btn btn-ghost -mr-2 text-sm">
          <History size={18} /> History
        </Link>
      </header>

      {!active && <DoneToday workouts={workouts.filter((w) => w.date === today && w.finishedAt)} sets={sets} />}

      {!active && days.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
          {days.map((d) => (
            <button key={d.id} className="chip" data-on={d.id === day?.id} onClick={() => setPickedDayId(d.id)}>
              {d.name}
              {d.id === suggested?.id && <span className="text-[11px] opacity-70">next</span>}
            </button>
          ))}
        </div>
      )}
      {muscleChips}

      <div className="space-y-3">
        {plan.map((p, i) => {
          const ex = exercises.get(p.exerciseId);
          if (!ex) return null;
          const done = sessionSets.filter((s) => s.exerciseId === p.exerciseId).sort((a, b) => a.order - b.order);
          const sessions = previousSessions(p.exerciseId, active?.id ?? null, workouts, sets);
          return (
            <ExerciseCard
              key={p.exerciseId}
              exercise={ex}
              plan={p}
              done={done}
              last={sessions[0] ?? []}
              progression={planProgression(p.exerciseId, p, sessions)}
              current={i === currentIdx}
              expanded={i === currentIdx || opened.has(p.exerciseId)}
              onToggle={() =>
                setOpened((prev) => {
                  const next = new Set(prev);
                  if (next.has(p.exerciseId)) next.delete(p.exerciseId);
                  else next.add(p.exerciseId);
                  return next;
                })
              }
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

// Today's finished session, with the Obsidian action. Only shown when that
// setting is on, so the screen stays focused on the next workout otherwise.
function DoneToday({ workouts, sets }: { workouts: Workout[]; sets: WorkoutSet[] }) {
  const enabled = useObsidianEnabled();
  const ids = new Set(workouts.map((w) => w.id));
  const done = sets.filter((s) => ids.has(s.workoutId));
  if (!enabled || done.length === 0) return null;
  const prs = done.filter((s) => s.pr).length;
  return (
    <section className="card mb-4 p-4">
      <p className="font-semibold">Done today</p>
      <p className="mt-0.5 mb-3 text-sm text-muted">
        {[...new Set(workouts.filter((w) => done.some((s) => s.workoutId === w.id)).map((w) => w.splitDayName))].join(" + ")} · {done.length} sets
        {prs > 0 && ` · ${prs} PR${prs > 1 ? "s" : ""}`}
      </p>
      <SendToObsidian date={workouts[0].date} />
    </section>
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
  progression,
  current,
  expanded,
  onToggle,
  onLog,
  onEdit,
}: {
  exercise: Exercise;
  plan: PlannedExercise;
  done: WorkoutSet[];
  last: WorkoutSet[];
  progression: Progression | null;
  current: boolean;
  expanded: boolean;
  onToggle: () => void;
  onLog: (weightKg: number, reps: number) => void;
  onEdit: (e: Editing) => void;
}) {
  const pendingCount = Math.max(plan.sets - done.length, 0);
  const complete = pendingCount === 0 && done.length > 0;
  const range = plan.repMin === plan.repMax ? `${plan.repMin}` : `${plan.repMin}–${plan.repMax}`;

  return (
    <section
      className={`card transition-[box-shadow,border-color] duration-200 ${current ? "border-transparent shadow-[0_0_0_1.5px_var(--accent),0_8px_24px_-12px_rgb(0_0_0/0.35)]" : ""}`}
      aria-current={current ? "step" : undefined}
    >
      <button
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
        onClick={current ? undefined : onToggle}
        aria-expanded={expanded}
        disabled={current}
      >
        <span className="min-w-0">
          <span className={`block text-[17px] font-semibold tracking-[-0.015em] ${complete && !expanded ? "text-muted" : ""}`}>{exercise.name}</span>
          <span className="mt-0.5 block text-sm text-muted">
            {complete && !expanded ? (
              <span className="num">{formatSets(done).replace(/^0 kg/, "BW")}</span>
            ) : last.length ? (
              <>
                Last time: <span className="num">{formatSets(last).replace(/^0 kg/, "BW")}</span>
              </>
            ) : (
              "First time: set a baseline"
            )}
          </span>
        </span>
        <span className={`num flex shrink-0 items-center gap-2 text-xs ${complete ? "text-accent" : "text-faint"}`}>
          {complete ? (
            <Check size={18} aria-label="Done" />
          ) : (
            <span className="flex flex-col items-end gap-1.5">
              {/* One pip per planned set, filled as you log them. */}
              <span className="flex gap-1" aria-label={`${done.length} of ${plan.sets} sets done`}>
                {Array.from({ length: plan.sets }, (_, i) => (
                  <span key={i} className={`h-1 w-3.5 rounded-full transition-colors duration-300 ${i < done.length ? "bg-accent" : "bg-line-strong"}`} />
                ))}
              </span>
              <span>
                {plan.sets} × {range}
              </span>
            </span>
          )}
          {!current && <ChevronDown size={16} className={`text-faint transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />}
        </span>
      </button>
      {expanded && (
        <div className="-mt-2 px-4 pb-3">
          {progression && !complete && <ProgressionNote p={progression} />}
          <ul className="mt-2 divide-y divide-line">
            {done.map((s, i) => (
              <li key={s.id} className="animate-enter">
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
                      <Trophy size={13} aria-hidden /> <PrLabel />
                    </span>
                  ) : (
                    <Check size={18} className="text-accent" />
                  )}
                </button>
              </li>
            ))}
            {Array.from({ length: pendingCount }, (_, k) => {
              const idx = done.length + k;
              const s = suggestSet(idx, done, progression, plan.repMin);
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
                      <span className={`border-b border-dashed border-line-strong ${first ? "text-[19px] font-semibold tracking-[-0.02em]" : ""}`}>
                        {showKg(s.weightKg)} × {s.reps}
                      </span>
                    ) : s ? (
                      <span className="border-b border-dashed border-line-strong text-muted">Enter weight × {s.reps}</span>
                    ) : (
                      <span className="text-faint">Tap to enter</span>
                    )}
                  </button>
                  {first && (
                    <LogSpark>
                    <button
                      className="btn btn-primary min-h-11 px-6"
                      onClick={() =>
                        s && (last.length || done.length) ? onLog(s.weightKg, s.reps) : onEdit({ exerciseId: exercise.id, weightKg: s?.weightKg ?? 0, reps: s?.reps ?? plan.repMin })
                      }
                    >
                      Log
                    </button>
                    </LogSpark>
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
        </div>
      )}
    </section>
  );
}

// Today's target from double progression, with the reason in plain words.
function ProgressionNote({ p }: { p: Progression }) {
  const Icon = p.kind === "deload" ? TrendingDown : TrendingUp;
  const head =
    p.kind === "increase" ? `Go up to ${showKg(p.weightKg)}` : p.kind === "deload" ? `Lighter week: ${showKg(p.weightKg)}` : `Aim for ${p.reps.join(", ")} reps`;
  return (
    <p className={`mt-1.5 flex items-start gap-1.5 text-sm ${p.kind === "deload" ? "text-pr" : "text-accent"}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span>
        <span className="font-medium">{head}.</span> <span className="text-muted">{p.note}</span>
      </span>
    </p>
  );
}

// Logging a set bursts volt sparks off the button (React Bits ClickSpark):
// the one tap that matters most gets the most satisfying feedback.
function LogSpark({ children }: { children: ReactNode }) {
  const accent = useTokenColor("--accent", "#c5f04a");
  return (
    <ClickSpark sparkColor={accent} sparkCount={10} sparkRadius={34} sparkSize={9} duration={480} className="h-auto! w-auto!">
      {children}
    </ClickSpark>
  );
}

// A sheen sweeps across the badge once when a PR lands (React Bits ShinyText).
function PrLabel() {
  const pr = useTokenColor("--pr", "#ff8a3d");
  return <ShinyText text="New PR" color={pr} shineColor="#ffffff" trigger="view" speed={1.4} />;
}
