"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUp, Check, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { type ChatMessage, coachContext, type Proposal } from "@/lib/coach";
import { askCoach, useCoachEnabled } from "@/lib/coach-access";
import { CURATED_FOODS } from "@/lib/data/indian-foods";
import { dateKey } from "@/lib/dates";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { logFood, mealForNow, newId, remove } from "@/lib/repo";
import type { Food, Meal } from "@/lib/types";

// The chat stays on this device only (meta is never synced).
const CHAT_KEY = "coachChat";
const MEALS: { value: Meal; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "snack", label: "Snack" },
  { value: "dinner", label: "Dinner" },
];
const STARTERS = ["What should I eat tonight to hit my protein?", "How is my training progressing?", "Log 2 rotis, dal and curd for lunch"];

const saveChat = (messages: ChatMessage[]) => db.meta.put({ key: CHAT_KEY, value: messages.slice(-60) });

async function readContext(): Promise<string> {
  const [profile, targets, entries, foods, workouts, sets, exercises, weights, days] = await Promise.all([
    db.profile.get(PROFILE_ID),
    db.targets.toArray(),
    db.foodEntries.toArray(),
    db.foods.toArray(),
    db.workouts.toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
    db.weights.toArray(),
    db.days.toArray(),
  ]);
  return coachContext(
    {
      profile: profile ?? null,
      targets: alive(targets),
      entries: alive(entries),
      foods: alive(foods),
      workouts: alive(workouts),
      sets: alive(sets),
      exercises: alive(exercises),
      weights: alive(weights),
      days: alive(days),
    },
    dateKey(),
  );
}

export function CoachScreen() {
  const enabled = useCoachEnabled();
  const stored = useLiveQuery(async () => ((await db.meta.get(CHAT_KEY))?.value as ChatMessage[] | undefined) ?? [], []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = stored ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...messages, { role: "user" as const, text: q }];
    setDraft("");
    setError(null);
    setBusy(true);
    await saveChat(next);
    try {
      const reply = await askCoach(next, await readContext());
      await saveChat([...next, { role: "assistant", text: reply.text, ...(reply.proposal ? { proposal: reply.proposal } : {}) }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The coach is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  const setProposal = async (i: number, p: Proposal) => {
    const now = ((await db.meta.get(CHAT_KEY))?.value as ChatMessage[] | undefined) ?? [];
    await saveChat(now.map((m, j) => (j === i ? { ...m, proposal: p } : m)));
  };

  if (stored === undefined) return null;
  if (!enabled) {
    return (
      <div className="px-4 pt-5">
        <h1 className="title mb-3">Coach</h1>
        <p className="text-muted">
          The coach isn&apos;t turned on for this account. Sign in under{" "}
          <Link href="/settings" className="text-accent underline">
            Settings
          </Link>{" "}
          with an account that has it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-col px-4 pt-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="title">Coach</h1>
          <p className="mt-0.5 text-sm text-muted">Knows your workouts, food and weight. AI can be wrong.</p>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-ghost btn-icon -mr-2" onClick={() => void saveChat([])} aria-label="Clear chat">
            <Trash2 size={19} />
          </button>
        )}
      </header>

      <div className="flex-1 space-y-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="card p-4">
            <p className="flex items-center gap-2 font-semibold">
              <Sparkles size={18} className="text-accent" aria-hidden /> Ask about training or food
            </p>
            <p className="mt-1 text-sm text-muted">Or tell it what you ate and it fills in the log for you to confirm.</p>
            <div className="mt-3 flex flex-col items-start gap-2">
              {STARTERS.map((s) => (
                <button key={s} className="chip text-left" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] rounded-[22px] rounded-br-md bg-accent px-4 py-2.5 whitespace-pre-wrap text-on-accent">
              {m.text}
            </p>
          ) : (
            <div key={i} className="max-w-[92%]">
              <div className="card px-4 py-3 whitespace-pre-wrap">{rich(m.text)}</div>
              {m.proposal && <ProposalCard proposal={m.proposal} onChange={(p) => void setProposal(i, p)} />}
            </div>
          ),
        )}
        {busy && (
          <p className="card w-fit px-4 py-3 text-muted" role="status">
            Thinking…
          </p>
        )}
        {error && (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm" role="alert">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky z-10 -mx-4 mt-3 px-4 py-2"
        style={{ bottom: "calc(92px + var(--dock, 0px) + env(safe-area-inset-bottom))" }}
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <div className="glass-control flex items-end gap-2 p-1.5 pl-4 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-accent">
          <textarea
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 bare-field placeholder:text-faint"
            rows={1}
            placeholder="Ask, or say what you ate…"
            aria-label="Message the coach"
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <button className="btn btn-primary btn-icon shrink-0" disabled={busy || !draft.trim()} aria-label="Send">
            <ArrowUp size={20} />
          </button>
        </div>
      </form>
    </div>
  );
}

// **bold** only; everything else stays plain text.
function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
  );
}

// The food the coach proposes, logged only when the person taps Log.
function ProposalCard({ proposal, onChange }: { proposal: Proposal; onChange: (p: Proposal) => void }) {
  const toast = useToast();
  const [meal, setMeal] = useState<Meal>(proposal.meal ?? mealForNow());
  const total = proposal.items.reduce((s, i) => ({ kcal: s.kcal + i.kcal * i.servings, protein: s.protein + i.protein * i.servings }), { kcal: 0, protein: 0 });

  const log = async () => {
    const own = new Map(alive(await db.foods.toArray()).map((f) => [f.id, f]));
    const ids: string[] = [];
    for (const it of proposal.items) {
      const known: Food | undefined = (it.foodId && (CURATED_FOODS.find((f) => f.id === it.foodId) ?? own.get(it.foodId))) || undefined;
      const food: Omit<Food, "updatedAt"> = known ?? { id: newId(), name: it.name, serving: it.serving, servingGrams: null, kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat, source: "user" };
      ids.push((await logFood(food, it.servings, meal, dateKey())).id);
    }
    onChange({ ...proposal, meal, status: "logged" });
    toast(`Logged ${ids.length} ${ids.length === 1 ? "item" : "items"} to ${meal}`, {
      label: "Undo",
      run: () => {
        ids.forEach((id) => void remove("foodEntries", id));
        onChange({ ...proposal, meal, status: "pending" });
      },
    });
  };

  return (
    <div className="card mt-2 p-4">
      <ul className="divide-y divide-line">
        {proposal.items.map((it, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block truncate">{it.name}</span>
              <span className="block text-xs text-muted">
                {it.servings !== 1 && `${it.servings} × `}
                {it.serving}
              </span>
            </span>
            <span className="num shrink-0 text-right text-sm">
              {Math.round(it.protein * it.servings)} g<span className="block text-xs text-muted">{Math.round(it.kcal * it.servings)} kcal</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="num mt-1 text-sm text-muted">
        Total {Math.round(total.kcal)} kcal · {Math.round(total.protein)} g protein
      </p>
      {proposal.status === "logged" ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-accent">
          <Check size={16} aria-hidden /> Logged to {proposal.meal ?? meal}
        </p>
      ) : proposal.status === "dismissed" ? (
        <p className="mt-3 text-sm text-faint">Not logged</p>
      ) : (
        <>
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Meal">
            {MEALS.map((m) => (
              <button key={m.value} className="chip shrink-0" data-on={m.value === meal} aria-pressed={m.value === meal} onClick={() => setMeal(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => void log()}>
              Log
            </button>
            <button className="btn btn-ghost" onClick={() => onChange({ ...proposal, status: "dismissed" })}>
              Not now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
