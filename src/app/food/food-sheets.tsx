"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Segmented, Sheet, Stepper } from "@/components/ui";
import { proteinPer100Kcal } from "@/lib/protein";
import { newId } from "@/lib/repo";
import type { Food, FoodEntry, Meal } from "@/lib/types";

export const MEALS: { value: Meal; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "snack", label: "Snack" },
  { value: "dinner", label: "Dinner" },
];

const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString());

export function sourceLabel(f: Pick<Food, "source" | "brand" | "recipe">) {
  if (f.source === "off") return f.brand ? `${f.brand} · label` : "Packaged · label";
  if (f.source === "user") return f.recipe ? `Your recipe · makes ${f.recipe.servings}` : "Your food";
  if (f.source === "indb") return "Indian Nutrient Databank recipe";
  return "Typical home recipe";
}

export type FoodTarget =
  | { kind: "add"; food: Food; servings?: number }
  | { kind: "edit"; entry: FoodEntry };

interface AddFoodProps {
  defaultMeal: Meal;
  onEditRecipe?: (food: Food) => void;
  onAdd: (food: Food, servings: number, meal: Meal) => void;
  onUpdate: (entry: FoodEntry, servings: number, meal: Meal) => void;
  onDelete: (entry: FoodEntry) => void;
}

// Sheet content mounts fresh on every open, so form state starts from props.
export function AddFoodSheet({ target, onClose, ...rest }: AddFoodProps & { target: FoodTarget | null; onClose: () => void }) {
  const title = target ? (target.kind === "edit" ? target.entry.name : target.food.name) : "";
  return (
    <Sheet open={!!target} onClose={onClose} title={title}>
      {target && <AddFoodForm target={target} {...rest} />}
    </Sheet>
  );
}

function AddFoodForm({ target, defaultMeal, onAdd, onUpdate, onDelete, onEditRecipe }: AddFoodProps & { target: FoodTarget }) {
  const [servings, setServings] = useState(target.kind === "edit" ? target.entry.servings : (target.servings ?? 1));
  const [meal, setMeal] = useState<Meal>(target.kind === "edit" ? target.entry.meal : defaultMeal);
  const per = target.kind === "edit" ? target.entry : target.food;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {per.serving}
        {target.kind === "add" && ` · ${sourceLabel(target.food)}`}
        {target.kind === "add" && target.food.recipe && onEditRecipe && (
          <>
            {" · "}
            <button className="font-medium text-accent" onClick={() => onEditRecipe(target.food)}>
              Edit recipe
            </button>
          </>
        )}
      </p>
      <div className="grid grid-cols-4 gap-2 text-center">
        {(
          [
            ["kcal", per.kcal],
            ["protein", per.protein],
            ["carbs", per.carbs],
            ["fat", per.fat],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-2xl bg-surface-2 py-2.5">
            <p className="num text-lg font-semibold">
              {fmt(v * servings)}
              {label !== "kcal" && <span className="text-sm font-normal text-muted">g</span>}
            </p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>
      <p className="num -mt-2 text-sm text-muted">{proteinPer100Kcal(per)} g protein per 100 kcal</p>
      <div>
        <p className="label mb-1.5">Servings</p>
        <Stepper label="servings" value={servings} step={0.5} min={0.25} onChange={setServings} />
      </div>
      <Segmented value={meal} options={MEALS} onChange={setMeal} ariaLabel="Meal" />
      {target.kind === "add" ? (
        <button className="btn btn-primary w-full" disabled={servings <= 0} onClick={() => onAdd(target.food, servings, meal)}>
          Add to {MEALS.find((m) => m.value === meal)!.label.toLowerCase()}
        </button>
      ) : (
        <>
          <button className="btn btn-primary w-full" disabled={servings <= 0} onClick={() => onUpdate(target.entry, servings, meal)}>
            Save
          </button>
          <button className="btn btn-ghost w-full text-danger" onClick={() => onDelete(target.entry)}>
            <Trash2 size={16} /> Remove
          </button>
        </>
      )}
    </div>
  );
}

export function CustomFoodSheet({
  open,
  initialName,
  barcode,
  onClose,
  onCreate,
}: {
  open: boolean;
  initialName: string;
  barcode?: string;
  onClose: () => void;
  onCreate: (food: Food) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="New food">
      <CustomFoodForm initialName={initialName} barcode={barcode} onCreate={onCreate} />
    </Sheet>
  );
}

function CustomFoodForm({ initialName, barcode, onCreate }: { initialName: string; barcode?: string; onCreate: (food: Food) => void }) {
  const [form, setForm] = useState({ name: initialName, serving: "1 serving", kcal: "", protein: "", carbs: "", fat: "" });
  const n = (s: string) => Math.max(0, parseFloat(s.replace(",", ".")) || 0);
  const valid = form.name.trim() && form.serving.trim() && n(form.kcal) > 0;
  const field = (key: keyof typeof form, label: string, numeric = false) => (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      <input
        className={`input ${numeric ? "num" : ""}`}
        inputMode={numeric ? "decimal" : undefined}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="space-y-3">
      {barcode && <p className="-mt-1 text-sm text-muted">No match for barcode {barcode}. Copy the numbers from the label.</p>}
      {field("name", "Name")}
      {field("serving", "One serving is (e.g. 1 bowl, 100 g)")}
      <div className="grid grid-cols-2 gap-3">
        {field("kcal", "Calories", true)}
        {field("protein", "Protein (g)", true)}
        {field("carbs", "Carbs (g)", true)}
        {field("fat", "Fat (g)", true)}
      </div>
      <button
        className="btn btn-primary w-full"
        disabled={!valid}
        onClick={() =>
          onCreate({
            id: newId(),
            name: form.name.trim(),
            serving: form.serving.trim(),
            servingGrams: null,
            kcal: Math.round(n(form.kcal)),
            protein: n(form.protein),
            carbs: n(form.carbs),
            fat: n(form.fat),
            source: "user",
            barcode: barcode ?? null,
            updatedAt: 0,
          })
        }
      >
        Save food
      </button>
    </div>
  );
}

export function NameSheet({
  open,
  title,
  placeholder,
  action,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  placeholder: string;
  action: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <NameForm placeholder={placeholder} action={action} onSubmit={onSubmit} />
    </Sheet>
  );
}

function NameForm({ placeholder, action, onSubmit }: { placeholder: string; action: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <input className="input" placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <button className="btn btn-primary w-full" disabled={!name.trim()} type="submit">
        {action}
      </button>
    </form>
  );
}
