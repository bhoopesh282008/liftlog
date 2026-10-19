"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

const round = (n: number) => Math.round(n).toLocaleString();

// A number that rolls to its new value when it changes (after you log food,
// say), so the change reads as progress. It shows the real value straight
// away when it first appears: no count-up on every screen visit.
export function CountUp({ value, format = round, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    const from = shown.current;
    shown.current = value;
    if (!el || from === value) return;
    if (reduce) {
      el.textContent = format(value);
      return;
    }
    const controls = animate(from, value, {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [value, format, reduce]);

  return (
    <span ref={ref} className={`num ${className ?? ""}`}>
      {format(value)}
    </span>
  );
}
