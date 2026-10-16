"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { WorkoutSet } from "@/lib/types";
import { Sheet, Stepper } from "./ui";

export const showKg = (kg: number) => (kg === 0 ? "BW" : `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`);

export interface Editing {
  exerciseId: string;
  set?: WorkoutSet;
  weightKg: number;
  reps: number;
}

export function SetSheet({
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
