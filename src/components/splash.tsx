"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SoffitGradient } from "./soffit-gradient";

// Longest the intro may hold the app back if its animations never report
// finishing (a throttled background tab, say).
const MAX_INTRO_MS = 2500;
const LEAVE_MS = 600;
const WORD = "LiftLog";

// Covers the screen from the first server-rendered paint: the barbell
// assembles, the wordmark rises, then the screen lifts away once the intro
// has played and the app has read the profile. Always dark, like the
// manifest's launch colour, so launching from the home screen is seamless.
// Only plays on a fresh load: the app shell stays mounted across tabs.
export function Splash({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [introDone, setIntroDone] = useState(false);
  const [phase, setPhase] = useState<"show" | "leave" | "gone">("show");

  // The intro started at first paint, before hydration, so wait for the
  // animations themselves rather than a fixed timer.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const finished = el
      .getAnimations({ subtree: true })
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => undefined));
    const cap = new Promise((r) => setTimeout(r, MAX_INTRO_MS));
    void Promise.race([Promise.all(finished), cap]).then(() => !cancelled && setIntroDone(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !introDone) return;
    const leave = setTimeout(() => setPhase("leave"), 120);
    const gone = setTimeout(() => setPhase("gone"), 120 + LEAVE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(gone);
    };
  }, [ready, introDone]);

  if (phase === "gone") return null;
  return (
    <div
      ref={ref}
      role="status"
      aria-label="Loading LiftLog"
      className={`fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-[#0a0b0c] ${phase === "leave" ? "splash-leave pointer-events-none" : ""}`}
    >
      <div
        aria-hidden
        className="splash-wash pointer-events-none absolute size-[560px] rounded-full"
        style={{ background: "radial-gradient(circle, rgb(197 240 74 / 0.14), transparent 62%)" }}
      />
      {/* Volt light falling across the screen; fades in over the CSS wash
          once WebGL has drawn its first frame. */}
      <SoffitGradient className="absolute inset-0 size-full" />
      <div className="splash-lockup relative flex flex-col items-center gap-7">
        <Barbell />
        <p className="font-display overflow-hidden pb-1 text-[52px] leading-none font-bold tracking-[0.01em] text-[#f2f3f1] uppercase" aria-hidden>
          {[...WORD].map((ch, i) => (
            <span key={i} className="splash-letter" style={{ "--d": `${560 + i * 30}ms` } as CSSProperties}>
              {ch}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

// The app icon's dumbbell, built from the same boxes: inner plates land
// first, outer plates a beat later, then the whole bar settles with a thud.
function Barbell() {
  const plate = (h: number, side: "l" | "r", delay: number) => (
    <span
      className={`splash-plate-${side} block rounded-[5px] bg-[#c5f04a]`}
      style={{ width: 13, height: h, "--d": `${delay}ms` } as CSSProperties}
    />
  );
  return (
    <div aria-hidden className="splash-mark flex items-center gap-[5px]">
      {plate(42, "l", 360)}
      {plate(70, "l", 240)}
      <span className="splash-bar block h-[12px] w-[60px] rounded-[4px] bg-[#c5f04a]" />
      {plate(70, "r", 240)}
      {plate(42, "r", 360)}
    </div>
  );
}
