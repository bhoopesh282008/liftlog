"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ExercisePicker } from "@/components/exercise-picker";
import { useToast } from "@/components/toast";
import { Sheet } from "@/components/ui";
import { SPLIT_TEMPLATES } from "@/lib/data/split-templates";
import { alive, db } from "@/lib/db";
import { applyTemplate, remove, save, saveSplitDay } from "@/lib/repo";
import type { PlannedExercise, SplitDay } from "@/lib/types";

export function SplitEditor() {
  const toast = useToast();
  const [pickingFor, setPickingFor] = useState<SplitDay | null>(null);
  const [templates, setTemplates] = useState(false);
  const data = useLiveQuery(async () => {
    const [days, exercises] = await Promise.all([db.splitDays.toArray(), db.exercises.toArray()]);
    return {
      days: alive(days).sort((a, b) => a.order - b.order),
      names: new Map(alive(exercises).map((e) => [e.id, e.name])),
    };
  }, []);
  if (!data) return null;
  const { days, names } = data;

  const update = (day: SplitDay, exercises: PlannedExercise[]) => void save("splitDays", { ...day, exercises });
  const swapDays = async (i: number, j: number) => {
    await save("splitDays", { ...days[i], order: days[j].order });
    await save("splitDays", { ...days[j], order: days[i].order });
  };

  return (
    <div className="px-4 pt-3">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/settings" className="btn btn-ghost btn-icon -ml-2" aria-label="Back to settings">
          <ArrowLeft size={20} />
        </Link>
        <button className="btn btn-ghost text-sm" onClick={() => setTemplates(true)}>
          Use a template
        </button>
      </div>
      <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Your split</h1>
      <p className="mt-1 mb-5 text-sm text-muted">Days run in this order, then repeat. A missed day never gets skipped.</p>

      <div className="space-y-3">
        {days.map((day, i) => (
          <section key={day.id} className="card p-4">
            <div className="flex items-center gap-1">
              <input
                className="input -ml-1 min-h-10 flex-1 bg-transparent px-1 text-lg font-semibold focus:px-3"
                defaultValue={day.name}
                aria-label="Day name"
                onBlur={(e) => e.target.value.trim() && e.target.value !== day.name && void save("splitDays", { ...day, name: e.target.value.trim() })}
              />
              <button className="btn btn-ghost btn-icon" disabled={i === 0} onClick={() => swapDays(i, i - 1)} aria-label="Move day up">
                <ArrowUp size={18} />
              </button>
              <button className="btn btn-ghost btn-icon" disabled={i === days.length - 1} onClick={() => swapDays(i, i + 1)} aria-label="Move day down">
                <ArrowDown size={18} />
              </button>
              <button
                className="btn btn-ghost btn-icon"
                onClick={async () => {
                  await remove("splitDays", day.id);
                  toast(`Removed ${day.name}`, { label: "Undo", run: () => void save("splitDays", { ...day, deletedAt: null }) });
                }}
                aria-label={`Delete ${day.name}`}
              >
                <Trash2 size={18} />
              </button>
            </div>

            <ul className="mt-2 divide-y divide-line">
              {day.exercises.map((p, k) => (
                <li key={`${p.exerciseId}-${k}`} className="flex min-h-14 items-center gap-2 py-1.5">
                  <div className="flex flex-col">
                    <button
                      className="flex size-7 items-center justify-center text-faint disabled:opacity-30"
                      disabled={k === 0}
                      aria-label="Move up"
                      onClick={() => {
                        const next = [...day.exercises];
                        [next[k - 1], next[k]] = [next[k], next[k - 1]];
                        update(day, next);
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="flex size-7 items-center justify-center text-faint disabled:opacity-30"
                      disabled={k === day.exercises.length - 1}
                      aria-label="Move down"
                      onClick={() => {
                        const next = [...day.exercises];
                        [next[k + 1], next[k]] = [next[k], next[k + 1]];
                        update(day, next);
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <span className="min-w-0 flex-1 truncate">{names.get(p.exerciseId) ?? "Removed exercise"}</span>
                  <PlanInput
                    value={p}
                    onChange={(np) => update(day, day.exercises.map((x, idx) => (idx === k ? np : x)))}
                  />
                  <button
                    className="flex size-10 items-center justify-center text-faint"
                    aria-label="Remove exercise"
                    onClick={() => update(day, day.exercises.filter((_, idx) => idx !== k))}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <button className="mt-1 flex min-h-11 items-center gap-1 text-sm font-medium text-accent" onClick={() => setPickingFor(day)}>
              <Plus size={16} /> Add exercise
            </button>
          </section>
        ))}
      </div>

      <button className="btn mt-4 w-full" onClick={() => void saveSplitDay({ name: `Day ${days.length + 1}`, exercises: [] })}>
        <Plus size={18} /> Add day
      </button>

      <ExercisePicker
        open={!!pickingFor}
        onClose={() => setPickingFor(null)}
        onPick={(id) => pickingFor && update(pickingFor, [...pickingFor.exercises, { exerciseId: id, sets: 3, repMin: 8, repMax: 12 }])}
      />

      <Sheet open={templates} onClose={() => setTemplates(false)} title="Replace with a template">
        <p className="-mt-1 mb-3 text-sm text-muted">This replaces your current days. Your workout history stays.</p>
        <div className="space-y-2">
          {SPLIT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="w-full rounded-2xl border border-line px-4 py-3 text-left active:bg-surface-2"
              onClick={async () => {
                await applyTemplate(t.id);
                setTemplates(false);
                toast(`Split set to ${t.name}`);
              }}
            >
              <span className="block font-medium">{t.name}</span>
              <span className="block text-sm text-muted">{t.blurb}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

// Compact "3 × 8–12" editor: sets, then a rep range.
function PlanInput({ value, onChange }: { value: PlannedExercise; onChange: (p: PlannedExercise) => void }) {
  const [text, setText] = useState(`${value.sets}×${value.repMin}-${value.repMax}`);
  const commit = () => {
    const m = text.replace(/\s/g, "").match(/^(\d+)[x×*](\d+)(?:[-–](\d+))?$/i);
    if (!m) {
      setText(`${value.sets}×${value.repMin}-${value.repMax}`);
      return;
    }
    const sets = Math.min(10, Math.max(1, +m[1]));
    const repMin = Math.max(1, +m[2]);
    const repMax = Math.max(repMin, m[3] ? +m[3] : repMin);
    setText(`${sets}×${repMin}-${repMax}`);
    onChange({ ...value, sets, repMin, repMax });
  };
  return (
    <input
      className="input num min-h-10 w-24 px-2 text-center text-sm"
      aria-label="Sets and reps, like 3×8-12"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
