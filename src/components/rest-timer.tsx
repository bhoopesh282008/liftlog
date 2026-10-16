"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface TimerState {
  endAt: number | null;
  total: number;
}

interface RestTimer extends TimerState {
  remaining: number;
  justFinished: boolean;
  start: (seconds: number) => void;
  add: (seconds: number) => void;
  stop: () => void;
}

const KEY = "lift-log:rest";
const Ctx = createContext<RestTimer | null>(null);

function restore(): TimerState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as TimerState | null;
    if (saved?.endAt && saved.endAt > Date.now()) return saved;
  } catch {}
  return { endAt: null, total: 0 };
}

// The timer stores its end time, not a countdown, so it stays correct when
// the phone locks or the app is in the background.
export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TimerState>(restore);
  const [now, setNow] = useState(() => Date.now());
  const [justFinished, setJustFinished] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  const persist = (s: TimerState) => {
    setState(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  };

  // iOS only allows sound from an AudioContext unlocked by a tap, and the
  // timer always starts from a tap.
  const unlockAudio = () => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current ??= new AC();
      void audio.current.resume();
    } catch {}
  };

  const chime = useCallback(() => {
    const ac = audio.current;
    if (ac) {
      [0, 0.18].forEach((offset, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.value = i ? 1046 : 784;
        g.gain.setValueAtTime(0.0001, ac.currentTime + offset);
        g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + offset + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + offset + 0.35);
        o.connect(g).connect(ac.destination);
        o.start(ac.currentTime + offset);
        o.stop(ac.currentTime + offset + 0.4);
      });
    }
    navigator.vibrate?.([120, 80, 120]);
  }, []);

  useEffect(() => {
    if (!state.endAt) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (state.endAt && t >= state.endAt) {
        persist({ endAt: null, total: 0 });
        // Only chime if it ran out while the app was open, not on reopen.
        if (t - state.endAt < 2000) chime();
        setJustFinished(true);
        setTimeout(() => setJustFinished(false), 4000);
      }
    }, 250);
    return () => clearInterval(id);
  }, [state.endAt, chime]);

  const value: RestTimer = {
    ...state,
    remaining: state.endAt ? Math.max(0, Math.ceil((state.endAt - now) / 1000)) : 0,
    justFinished,
    start: (seconds) => {
      unlockAudio();
      setNow(Date.now());
      setJustFinished(false);
      persist({ endAt: Date.now() + seconds * 1000, total: seconds });
    },
    add: (seconds) => {
      if (!state.endAt) return;
      const endAt = Math.max(Date.now() + 1000, state.endAt + seconds * 1000);
      persist({ endAt, total: Math.max(state.total + seconds, 1) });
    },
    stop: () => persist({ endAt: null, total: 0 }),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRestTimer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRestTimer needs RestTimerProvider");
  return ctx;
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
