"use client";

import { useEffect, useState } from "react";

// Shortest time the splash stays up (from page load), so a fast load
// doesn't flash it for one frame. Slow loads add nothing on top.
const MIN_MS = 450;
const LEAVE_MS = 240;

// Covers the screen from the first server-rendered paint until the app is
// ready, the way an iPhone app launches: the mark settles in, then the whole
// screen zooms gently past you into the app. No staged choreography, so a
// cold start feels quick. Always graphite, like the iOS launch image.
export function Splash({ ready }: { ready: boolean }) {
  const [phase, setPhase] = useState<"show" | "leave" | "gone">("show");

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_MS - performance.now());
    const leave = setTimeout(() => setPhase("leave"), wait);
    const gone = setTimeout(() => setPhase("gone"), wait + LEAVE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(gone);
    };
  }, [ready]);

  if (phase === "gone") return null;
  return (
    <div
      role="status"
      aria-label="Loading LiftLog"
      className={`splash fixed inset-0 z-[60] flex items-center justify-center bg-[#0a0b0c] ${phase === "leave" ? "splash-leave pointer-events-none" : ""}`}
    >
      <div className="splash-mark flex flex-col items-center gap-5" aria-hidden>
        <div className="flex items-center gap-[5px]">
          <span className="block h-[42px] w-[13px] rounded-[5px] bg-[#ff4d4d]" />
          <span className="block h-[70px] w-[13px] rounded-[5px] bg-[#ff4d4d]" />
          <span className="block h-[12px] w-[60px] rounded-[4px] bg-[#ff4d4d]" />
          <span className="block h-[70px] w-[13px] rounded-[5px] bg-[#ff4d4d]" />
          <span className="block h-[42px] w-[13px] rounded-[5px] bg-[#ff4d4d]" />
        </div>
        <p className="font-display text-[44px] leading-none font-bold tracking-[0.01em] text-[#f2f3f1] uppercase">LiftLog</p>
      </div>
    </div>
  );
}
