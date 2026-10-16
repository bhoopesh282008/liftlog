"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SignInCard } from "@/components/sign-in";
import { useToast } from "@/components/toast";
import { Segmented } from "@/components/ui";
import { dateKey } from "@/lib/dates";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { ageFrom, ACTIVITY_LABELS, initialTargets, PACE_LABELS } from "@/lib/targets";
import { exportAll, latestWeight, newId, remove, save, setManualTarget, updateProfile } from "@/lib/repo";
import type { Activity, GainPace } from "@/lib/types";

export function SettingsScreen() {
  const toast = useToast();
  const data = useLiveQuery(async () => {
    const [profile, days, targets, foods, meals] = await Promise.all([
      db.profile.get(PROFILE_ID),
      db.splitDays.toArray(),
      db.targets.toArray(),
      db.foods.toArray(),
      db.savedMeals.toArray(),
    ]);
    return {
      profile,
      days: alive(days).sort((a, b) => a.order - b.order),
      target: alive(targets).sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt).at(-1),
      customFoods: alive(foods).filter((f) => f.source === "user"),
      meals: alive(meals),
    };
  }, []);

  if (!data?.profile) return null;
  const { profile, days, target, customFoods, meals } = data;

  const recalc = async () => {
    const w = await latestWeight();
    if (!w) return;
    const t = initialTargets({
      sex: profile.sex,
      age: ageFrom(profile.birthYear),
      heightCm: profile.heightCm,
      weightKg: w.kg,
      activity: profile.activity,
      pace: profile.pace,
    });
    await save("targets", {
      id: newId(),
      date: dateKey(),
      calories: t.calories,
      protein: t.protein,
      carbs: t.carbs,
      fat: t.fat,
      source: "manual",
      reason: `Recalculated from your stats at ${w.kg} kg.`,
    });
    toast(`Targets recalculated: ${t.calories.toLocaleString()} kcal`);
  };

  return (
    <div className="space-y-5 px-4 pt-5">
      <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Settings</h1>

      <Group title="Training">
        <Link href="/settings/split" className="flex min-h-14 items-center justify-between px-4">
          <span>
            <span className="block">Your split</span>
            <span className="block text-sm text-muted">{days.map((d) => d.name).join(" · ") || "Not set up"}</span>
          </span>
          <ChevronRight size={18} className="text-faint" />
        </Link>
        <div className="space-y-2 px-4 py-3">
          <p>Rest timer</p>
          <div>
            <Segmented
              value={String(profile.restSeconds)}
              onChange={(v) => void updateProfile({ restSeconds: Number(v) })}
              options={["60", "90", "120", "180"].map((s) => ({ value: s, label: Number(s) < 120 ? `${s}s` : `${Number(s) / 60}m` }))}
            />
          </div>
        </div>
      </Group>

      <Group title="Targets">
        <div className="px-4 py-3">
          <p className="num text-sm">
            {target ? `${target.calories.toLocaleString()} kcal · ${target.protein} g protein · ${target.carbs} g carbs · ${target.fat} g fat` : "No target yet"}
          </p>
          <CaloriesForm key={target?.id} initial={target?.calories ?? 0} onSaved={() => toast("Calorie target updated")} />
        </div>
        <Row label="Auto-adjust every 2 weeks" detail="Nudges calories when your weight trend is off pace">
          <Switch on={profile.autoAdjust} onChange={(v) => void updateProfile({ autoAdjust: v })} label="Auto-adjust" />
        </Row>
        <div className="space-y-3 px-4 py-3">
          <p className="label">Gain pace</p>
          <Segmented
            value={profile.pace}
            onChange={(v: GainPace) => void updateProfile({ pace: v })}
            options={(Object.keys(PACE_LABELS) as GainPace[]).map((p) => ({ value: p, label: p === "standard" ? "Standard" : p === "slow" ? "Slow" : "Fast" }))}
          />
          <p className="label">Activity</p>
          <select
            className="input"
            value={profile.activity}
            onChange={(e) => void updateProfile({ activity: e.target.value as Activity })}
          >
            {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => (
              <option key={a} value={a}>
                {ACTIVITY_LABELS[a]}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="label mb-1 block">Height (cm)</span>
              <input
                className="input num"
                inputMode="numeric"
                defaultValue={profile.heightCm}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (v >= 120 && v <= 230) void updateProfile({ heightCm: v });
                }}
              />
            </label>
            <label>
              <span className="label mb-1 block">Age</span>
              <input
                className="input num"
                inputMode="numeric"
                defaultValue={ageFrom(profile.birthYear)}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 14 && v <= 90) void updateProfile({ birthYear: new Date().getFullYear() - v });
                }}
              />
            </label>
          </div>
          <button className="btn w-full" onClick={recalc}>
            Recalculate targets from my stats
          </button>
        </div>
      </Group>

      <Group title="Account">
        <div className="px-4 py-4">
          <SignInCard />
        </div>
      </Group>

      {(meals.length > 0 || customFoods.length > 0) && (
        <Group title="Your foods">
          {meals.map((m) => (
            <DeleteRow key={m.id} label={m.name} detail={`Saved meal · ${m.items.length} items`} onDelete={() => void remove("savedMeals", m.id)} />
          ))}
          {customFoods.map((f) => (
            <DeleteRow key={f.id} label={f.name} detail={`${f.serving} · ${f.kcal} kcal · ${f.protein} g protein`} onDelete={() => void remove("foods", f.id)} />
          ))}
        </Group>
      )}

      <Group title="Data">
        <button
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left"
          onClick={async () => {
            const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `liftlog-backup-${dateKey()}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <Download size={18} className="text-muted" /> Export a backup
        </button>
      </Group>

      <p className="px-1 pb-4 text-xs text-faint">
        Indian dish values are typical home recipes. Packaged foods come from Open Food Facts. Oil and portion sizes vary, so save your own versions when they differ.
      </p>
    </div>
  );
}

function CaloriesForm({ initial, onSaved }: { initial: number; onSaved: () => void }) {
  const [calories, setCalories] = useState(initial ? String(initial) : "");
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const c = parseInt(calories, 10);
        const w = await latestWeight();
        if (c >= 1200 && c <= 6000 && w) {
          await setManualTarget(c, w.kg);
          onSaved();
        }
      }}
    >
      <input className="input num" inputMode="numeric" aria-label="Daily calories" value={calories} onChange={(e) => setCalories(e.target.value)} />
      <button className="btn shrink-0" type="submit">
        Set calories
      </button>
    </form>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="label mb-1.5 px-1">{title}</h2>
      <div className="card divide-y divide-line overflow-hidden">{children}</div>
    </section>
  );
}

function Row({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
      <span>
        <span className="block">{label}</span>
        {detail && <span className="block text-sm text-muted">{detail}</span>}
      </span>
      {children}
    </div>
  );
}

function DeleteRow({ label, detail, onDelete }: { label: string; detail: string; onDelete: () => void }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-2 pl-4 pr-1">
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        <span className="block truncate text-sm text-muted">{detail}</span>
      </span>
      <button className="btn btn-ghost btn-icon" onClick={onDelete} aria-label={`Delete ${label}`}>
        <Trash2 size={18} />
      </button>
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-13 shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-accent" : "bg-track"}`}
    >
      <span className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-5" : ""}`} />
    </button>
  );
}
