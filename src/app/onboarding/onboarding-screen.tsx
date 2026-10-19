"use client";

import { ArrowLeft, Dumbbell } from "lucide-react";
import { useState } from "react";
import SplitText from "@/components/react-bits/SplitText";
import { RestoreBackupButton } from "@/components/restore-backup";
import { SignInCard } from "@/components/sign-in";
import { Segmented } from "@/components/ui";
import { VantaFog } from "@/components/vanta-fog";
import { SPLIT_TEMPLATES, type SplitTemplateId } from "@/lib/data/split-templates";
import { completeOnboarding } from "@/lib/repo";
import { syncConfigured } from "@/lib/sync";
import { ACTIVITY_LABELS, formatAdjust, GOAL_MODES, MODE_LABELS, MODE_PROTEIN, modeFormula, modeTargets, modeWeeklyChangeKg } from "@/lib/targets";
import type { Activity, GoalMode, Sex } from "@/lib/types";

const STEPS = 5;

export function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState<Activity>("moderate");
  const [mode, setMode] = useState<GoalMode>("bulk");
  const [template, setTemplate] = useState<SplitTemplateId>("ppl");
  const [busy, setBusy] = useState(false);

  const n = (s: string) => parseFloat(s.replace(",", "."));
  const statsValid = n(age) >= 14 && n(age) <= 90 && n(height) >= 120 && n(height) <= 230 && n(weight) >= 30 && n(weight) <= 250;
  const stats = { sex, age: n(age), heightCm: n(height), weightKg: n(weight), activity };
  const targets = statsValid ? modeTargets(stats, mode) : null;

  const next = () => setStep((s) => s + 1);

  // The welcome is always dark, continuing straight on from the splash.
  if (step === 0) {
    return (
      <div className="dark-scope relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#0a0b0c] px-6 pt-16 pb-10 text-[#f2f3f1]">
        <VantaFog className="absolute inset-0 -z-10" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-[#0a0b0c] via-[#0a0b0c]/85 to-transparent" />
        <div className="animate-enter mb-10 flex size-14 items-center justify-center rounded-2xl bg-[#ff4d4d]/15 text-[#ff4d4d]">
          <Dumbbell size={28} aria-hidden />
        </div>
        <Headline text="Build muscle. Stay lean." />
        <p className="animate-enter mt-4 max-w-sm text-lg text-[#b9bcb4]" style={{ animationDelay: "450ms" }}>
          Log sets in two taps, track protein without the guesswork, and see if it&apos;s working.
        </p>
        <div className="animate-enter mt-auto space-y-3 pt-10" style={{ animationDelay: "600ms" }}>
          <button className="btn w-full bg-[#ff4d4d] font-semibold text-[#1a0505] hover:bg-[#ff6363]" onClick={next}>
            Get started
          </button>
          {syncConfigured && <SignInCard compact title="Already use LiftLog on another device?" />}
          <RestoreBackupButton className="btn btn-ghost w-full text-[#b9bcb4]" />
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
            <Title title="What's your goal?" body="It sets your calories and protein. You can change it later in Settings." />
            <Options
              value={mode}
              onChange={setMode}
              options={GOAL_MODES.map((m) => {
                const kg = modeWeeklyChangeKg(stats, m);
                return {
                  value: m,
                  label: MODE_LABELS[m].label,
                  detail: `${MODE_LABELS[m].detail}. ${formatAdjust(m)} calories${kg ? `, about ${kg > 0 ? "+" : "−"}${Math.abs(kg).toFixed(2)} kg a week` : ""}`,
                };
              })}
            />
            <Footer onNext={next} />
          </>
        )}

        {step === 4 && targets && (
          <>
            <Title title="Your daily targets" body="Every two weeks LiftLog checks your weight trend against the plan and nudges calories up or down." />
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
            <ul className="num mt-3 space-y-1 px-1 text-sm text-muted">
              {modeFormula(stats, mode).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2 px-1 text-sm text-muted">Protein at {MODE_PROTEIN[mode].toFixed(1)} g per kg matters most for keeping and building muscle.</p>
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
                await completeOnboarding({ ...stats, mode, template });
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
      <h1 className="title">{title}</h1>
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

// The headline rises in letter by letter (React Bits SplitText, on GSAP).
// Plain text under reduced motion.
function Headline({ text }: { text: string }) {
  const [reduce] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const className = "font-display text-[64px] leading-[0.88] font-bold uppercase";
  if (reduce) return <h1 className={className}>{text}</h1>;
  return <SplitText tag="h1" text={text} className={className} textAlign="left" splitType="chars" effect="rise" mask delay={22} duration={0.7} trigger="load" />;
}
