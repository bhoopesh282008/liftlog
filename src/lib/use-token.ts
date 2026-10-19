"use client";

import { useSyncExternalStore } from "react";

const scheme = () => window.matchMedia("(prefers-color-scheme: dark)");
const subscribe = (cb: () => void) => {
  const mq = scheme();
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

// A theme colour token (e.g. "--accent") resolved to a real colour, for
// canvas and gradient effects that can't read CSS variables. Follows the
// system switching between light and dark.
export function useTokenColor(name: string, fallback: string): string {
  return useSyncExternalStore(
    subscribe,
    () => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback,
    () => fallback,
  );
}
