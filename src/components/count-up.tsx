"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

const round = (n: number) => Math.round(n).toLocaleString();

// A number that counts to its new value with GSAP, so a change reads as
// progress: from zero when it first appears, then from the old value after
// each log. Writes the text directly, outside React's render, so a running
// count costs no re-renders. Lands instantly under reduced motion.
export function CountUp({ value, format = round, duration = 0.9, className }: { value: number; format?: (n: number) => string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        shown.current = value;
        el.textContent = format(value);
        return;
      }
      const box = { v: shown.current };
      el.textContent = format(box.v);
      gsap.to(box, {
        v: value,
        duration,
        ease: "power3.out",
        onUpdate: () => {
          shown.current = box.v;
          el.textContent = format(box.v);
        },
      });
    },
    { dependencies: [value] },
  );

  return (
    <span ref={ref} className={`num ${className ?? ""}`}>
      {format(value)}
    </span>
  );
}
