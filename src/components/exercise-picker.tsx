"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { MUSCLES } from "@/lib/data/exercises";
import { alive, db } from "@/lib/db";
import { addCustomExercise } from "@/lib/repo";
import { Sheet } from "./ui";

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (exerciseId: string) => void }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState(MUSCLES[0]);
  const loaded = useLiveQuery(async () => alive(await db.exercises.toArray()), []);
  const exercises = useMemo(() => loaded ?? [], [loaded]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = exercises
      .filter((e) => !needle || e.name.toLowerCase().includes(needle) || e.muscle.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
    const map = new Map<string, typeof list>();
    for (const e of list) map.set(e.muscle, [...(map.get(e.muscle) ?? []), e]);
    return [...map.entries()].sort(([a], [b]) => MUSCLES.indexOf(a) - MUSCLES.indexOf(b));
  }, [exercises, q]);

  const exact = exercises.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());
  const pick = (id: string) => {
    onPick(id);
    setQ("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <div className="relative mb-3">
        <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
        <input className="input pl-10" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {q.trim() && !exact && (
        <div className="mb-4 rounded-2xl border border-line p-3">
          <p className="mb-2 text-sm">
            Create <b>{q.trim()}</b>
          </p>
          <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
            {MUSCLES.map((m) => (
              <button key={m} className="chip" data-on={muscle === m} onClick={() => setMuscle(m)}>
                {m}
              </button>
            ))}
          </div>
          <button className="btn btn-primary w-full" onClick={async () => pick((await addCustomExercise(q, muscle)).id)}>
            <Plus size={18} /> Create exercise
          </button>
        </div>
      )}
      {groups.map(([group, list]) => (
        <section key={group} className="mb-3">
          <h3 className="label mb-1 px-1">{group}</h3>
          <ul>
            {list.map((e) => (
              <li key={e.id}>
                <button
                  className="flex min-h-12 w-full items-center justify-between rounded-xl px-1 text-left transition-colors duration-150 active:bg-surface-2"
                  onClick={() => pick(e.id)}
                >
                  <span>{e.name}</span>
                  {e.custom && <span className="text-xs text-faint">Custom</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
