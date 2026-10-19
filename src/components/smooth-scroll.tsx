"use client";

import gsap from "gsap";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

let lenis: Lenis | null = null;

// Sheets pause the smooth scroller so the page behind them stays put.
export const pauseSmoothScroll = () => lenis?.stop();
export const resumeSmoothScroll = () => lenis?.start();

// Lenis smooths mouse-wheel and trackpad scrolling on desktop. On phones it
// is never started: touch scrolling stays native, with its momentum and
// pull-to-refresh. It is driven by GSAP's ticker so any GSAP animation
// and the scroll position update in the same frame.
export function SmoothScroll() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const instance = new Lenis({
      lerp: 0.12,
      // Let dialogs, sheets and sideways chip rows scroll natively.
      prevent: (node) => Boolean(node.closest?.("[role=dialog], .no-scrollbar")),
    });
    lenis = instance;
    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      instance.destroy();
      if (lenis === instance) lenis = null;
    };
  }, []);

  return null;
}
