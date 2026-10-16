"use client";

import { ArrowLeft, Dumbbell } from "lucide-react";
import { useState } from "react";
import { SignInCard } from "@/components/sign-in";
import { Segmented } from "@/components/ui";
import { SPLIT_TEMPLATES, type SplitTemplateId } from "@/lib/data/split-templates";
import { completeOnboarding } from "@/lib/repo";
import { syncConfigured } from "@/lib/sync";
import { ACTIVITY_LABELS, initialTargets, PACE_LABELS, PACE_PERCENT_PER_MONTH, targetWeeklyGainKg } from "@/lib/targets";
import type { Activity, GainPace, Sex } from "@/lib/types";

const STEPS = 5;

export function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState<Activity>("moderate");
  const [pace, setPace] = useState<GainPace>("standard");
  const [template, setTemplate] = useState<SplitTemplateId>("ppl");
  const [busy, setBusy] = useState(false);

  const n = (s: string) => parseFloat(s.replace(",", "."));
  const statsValid = n(age) >= 14 && n(age) <= 90 && n(height) >= 120 && n(height) <= 230 && n(weight) >= 30 && n(weight) <= 250;
  const stats = { sex, age: n(age), heightCm: n(height), weightKg: n(weight), activity, pace };
  const targets = statsValid ? initialTargets(stats) : null;

  const next = () => setStep((s) => s + 1);

  if (step === 0) {
    return (
      <div className="flex min-h-dvh flex-col px-6 pt-16 pb-10">
        <div className="mb-8 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Dumbbell size={28} />
        </div>
        <h1 className="text-[34px] leading-tight font-semibold tracking-tight">Build muscle. Stay lean.</h1>
        <p className="mt-3 text-lg text-muted">
          Log sets in two taps, track protein without the guesswork, and see if it&apos;s working.
        </p>
        <div className="mt-auto space-y-3 pt-10">
          <button className="btn btn-primary w-full" onClick={next}>
            Get started
          </button>
          {syncConfigured && <SignInCard compact title="Already use LiftLog on another device?" />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col px-5 pt-4 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <button className="btn btn-ghost btn-icon -ml-2" onClick={() => setStep(step - 1)} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i < step ? "bg-accent" : "bg-track"}`} />
          ))}
        </div>
      </div>

      <div key={step} className="animate-enter flex flex-1 flex-col">
        {step === 1 && (
          <>
            <Title title="About you" body="Used to work out your calorie and protein targets. Stays on your device." />
            <div className="space-y-4">
              <Segmented value={sex} onChange={setSex} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
              <NumField label="Age" unit="years" value={age} onChange={setAge} />
              <NumField label="Height" unit="cm" value={height} onChange={setHeight} />
              <NumField label="Weight" unit="kg" value={weight} onChange={setWeight} />
            </div>
            <Footer disabled={!statsValid} onNext={next} />
          </>
        )}

        {step === 2 && (
          <>
            <Title title="How active are you?" body="Count your training and your job together." />
            <Options
              value={activity}
              onChange={setActivity}
              options={(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => ({ value: a, label: ACTIVITY_LABELS[a] }))}
            />
            <Footer onNext={next} />
          </>
        )}

        {step === 3 && (
          <>
            <Title title="How fast should you gain?" body="Slower gains add more muscle for each kilo. You can change this later." />
            <Options
              value={pace}
              onChange={setPace}
              options={(Object.keys(PACE_LABELS) as GainPace[]).map((p) => ({
                value: p,
                label: PACE_LABELS[p],
                detail: `About ${(targetWeeklyGainKg(n(weight) || 70, p) * 52 / 12).toFixed(1)} kg a month (${PACE_PERCENT_PER_MONTH[p]}% of body weight)`,
              }))}
            />
            <Footer onNext={next} />
          </>
        )}

        {step === 4 && targets && (
          <>
            <Title title="Your daily targets" body="A small surplus over maintenance. Every two weeks LiftLog checks your weight trend and nudges calories up or down." />
            <div className="card p-5">
              <p className="label">Calories</p>
              <p className="num text-5xl font-semibold tracking-tight">{targets.calories.toLocaleString()}</p>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Protein", targets.protein],
                  ["Carbs", targets.carbs],
                  ["Fat", targets.fat],
                ].map(([label, v]) => (
                  <div key={label} className="rounded-2xl bg-surface-2 py-3">
                    <p className="num text-xl font-semibold">{v} g</p>
                    <p className="text-xs text-muted">{label}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 px-1 text-sm text-muted">Protein is set at 2 g per kg of body weight, the part that matters most for building muscle.</p>
            <Footer onNext={next} />
          </>
        )}

        {step === 5 && (
          <>
            <Title title="Pick your split" body="It loads each session in order. You can rename days and swap exercises in Settings." />
            <Options
              value={template}
              onChange={setTemplate}
              options={SPLIT_TEMPLATES.map((t) => ({ value: t.id, label: t.name, detail: t.blurb }))}
            />
            <Footer
              label="Start training"
              disabled={busy}
              onNext={async () => {
                setBusy(true);
                await completeOnboarding({ ...stats, template });
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Title({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{body}</p>
    </div>
  );
}

function Footer({ onNext, disabled, label = "Continue" }: { onNext: () => void; disabled?: boolean; label?: string }) {
  return (
    <div className="mt-auto pt-8">
      <button className="btn btn-primary w-full" disabled={disabled} onClick={onNext}>
        {label}
      </button>
    </div>
  );
}

function NumField({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      <div className="relative">
        <input className="input num pr-16 text-lg" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">{unit}</span>
      </div>
    </label>
  );
}

function Options<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; detail?: string }[];
}) {
  return (
    <div className="space-y-2" role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-[border-color,background-color] duration-150 ${
              on ? "border-accent bg-accent-soft" : "border-line bg-surface"
            }`}
          >
            <span>
              <span className="block font-medium">{o.label}</span>
              {o.detail && <span className="mt-0.5 block text-sm text-muted">{o.detail}</span>}
            </span>
            <span className={`size-5 shrink-0 rounded-full border-2 ${on ? "border-accent bg-accent shadow-[inset_0_0_0_3px_var(--surface)]" : "border-line-strong"}`} />
          </button>
        );
      })}
    </div>
  );
}
