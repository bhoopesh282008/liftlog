"use client";

import { useEffect, useRef } from "react";

// Vanta's FOG effect (three.js r134) in red on graphite, behind the
// onboarding welcome. three.js and Vanta are loaded on demand here, so the
// rest of the app never downloads them. It only starts after the welcome has
// painted, never under reduced motion, and the plain graphite background
// stands in until it is ready (or if WebGL is missing).
export function VantaFog({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let effect: { destroy: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      const [THREE, { default: FOG }] = await Promise.all([import("three"), import("vanta/dist/vanta.fog.min")]);
      if (cancelled || !ref.current) return;
      try {
        effect = FOG({
          el: ref.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          highlightColor: 0xff4d4d,
          midtoneColor: 0x3a0c0f,
          lowlightColor: 0x150707,
          baseColor: 0x0a0b0c,
          blurFactor: 0.62,
          speed: 0.9,
          zoom: 0.75,
        });
        ref.current.style.opacity = "1";
      } catch {
        // No WebGL: the graphite background is the fallback.
      }
    })();

    return () => {
      cancelled = true;
      effect?.destroy();
    };
  }, []);

  return <div ref={ref} aria-hidden className={`opacity-0 transition-opacity duration-1000 ${className}`} />;
}
