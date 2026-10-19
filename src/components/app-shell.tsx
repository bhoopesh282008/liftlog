"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChartLine, Dumbbell, Settings, Share, Timer, Utensils, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { db, PROFILE_ID } from "@/lib/db";
import { CHANGE_EVENT, closeStaleWorkouts, runAutoAdjust } from "@/lib/repo";
import { supabase, syncConfigured, syncNow } from "@/lib/sync";
import { mmss, RestTimerProvider, useRestTimer } from "./rest-timer";
import { SmoothScroll } from "./smooth-scroll";
import { SlidingNumber } from "./motion-primitives/sliding-number";
import { AmbientBackdrop } from "./ambient-backdrop";
import { Splash } from "./splash";
import { ToastProvider } from "./toast";

const TABS = [
  { href: "/workout", label: "Workout", icon: Dumbbell },
  { href: "/food", label: "Food", icon: Utensils },
  { href: "/progress", label: "Progress", icon: ChartLine },
  { href: "/settings", label: "Settings", icon: Settings },
];

const noopSubscribe = () => () => {};

// All data lives in IndexedDB on the device, so the app renders on the
// client only. The server sends an empty shell that the service worker caches.
// The splash is in that shell too, so it shows before any script runs.
export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  // Motion honours the system's reduced-motion setting app-wide.
  return (
    <MotionConfig reducedMotion="user">
      {hydrated && <SmoothScroll />}
      {hydrated ? (
        <ToastProvider>
          <RestTimerProvider>
            <Gate onReady={markReady}>{children}</Gate>
          </RestTimerProvider>
        </ToastProvider>
      ) : (
        <div className="min-h-dvh" />
      )}
      <Splash ready={ready} />
    </MotionConfig>
  );
}

function Gate({ children, onReady }: { children: ReactNode; onReady: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  // undefined while loading, null when there is no profile yet.
  const profile = useLiveQuery(async () => (await db.profile.get(PROFILE_ID)) ?? null, []);
  const onboarding = pathname.startsWith("/onboarding");
  const needsOnboarding = profile === null || (profile && !profile.onboarded);

  useEffect(() => {
    if (profile === undefined) return;
    if (needsOnboarding && !onboarding) router.replace("/onboarding");
    else if (!needsOnboarding && (onboarding || pathname === "/")) router.replace("/workout");
  }, [profile, needsOnboarding, onboarding, pathname, router]);

  useBackgroundJobs(Boolean(profile?.onboarded));

  const waiting = profile === undefined || (needsOnboarding && !onboarding) || (!needsOnboarding && pathname === "/");
  useEffect(() => {
    if (!waiting) onReady();
  }, [waiting, onReady]);

  if (waiting) return <div className="min-h-dvh" />;
  if (onboarding) return <main className="pt-safe mx-auto min-h-dvh w-full max-w-lg">{children}</main>;

  return (
    <>
      <AmbientBackdrop />
      <div aria-hidden className="scroll-edge" />
      <main className="pt-safe pb-nav mx-auto min-h-dvh w-full max-w-2xl">
        <InstallHint />
        {/* Keyed by route so each tab plays its enter animation. */}
        <div key={pathname} className="animate-page">
          {children}
        </div>
      </main>
      {/* A floating dock: the page scrolls under it, and the rest timer
          docks on top like a mini player. */}
      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
      >
        <div className="pointer-events-auto mx-auto max-w-md">
          <RestDock linkToWorkout={!pathname.startsWith("/workout")} />
          <div className="glass-control flex p-1.5">
            {TABS.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition-colors duration-200 ${
                    active ? "text-accent" : "text-faint hover:text-muted"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {active && <motion.span layoutId="tab-pill" aria-hidden className="absolute inset-0 rounded-full bg-accent-soft" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <Icon size={21} strokeWidth={active ? 2.4 : 1.9} className="relative" aria-hidden />
                  <span className="relative">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

function useBackgroundJobs(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    void closeStaleWorkouts();
    void runAutoAdjust();
    void navigator.storage?.persist?.();
  }, [ready]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  // Sync soon after each change, when the connection returns, and once a minute.
  useEffect(() => {
    if (!syncConfigured) return;
    let debounce: ReturnType<typeof setTimeout>;
    let unsubscribe = () => {};
    let cancelled = false;
    const soon = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void syncNow(), 1500);
    };
    void syncNow();
    window.addEventListener(CHANGE_EVENT, soon);
    window.addEventListener("online", soon);
    const every = setInterval(() => document.visibilityState === "visible" && void syncNow(), 60_000);
    void supabase().then((sb) => {
      if (!sb || cancelled) return;
      const { data } = sb.auth.onAuthStateChange(() => soon());
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearInterval(every);
      window.removeEventListener(CHANGE_EVENT, soon);
      window.removeEventListener("online", soon);
      unsubscribe();
    };
  }, []);
}

// Docked above the tab bar like a mini player, so the rest countdown stays
// in view however far down the workout you scroll, on every tab.
function RestDock({ linkToWorkout }: { linkToWorkout: boolean }) {
  const t = useRestTimer();
  const visible = Boolean(t.endAt) || t.justFinished;

  // Pages and toasts read --dock to keep clear of the bar.
  useEffect(() => {
    document.documentElement.style.setProperty("--dock", visible ? "68px" : "0px");
  }, [visible]);

  const pct = t.total ? t.remaining / t.total : 0;
  const time = (
    <span className="flex items-baseline gap-2">
      <Timer size={16} className="self-center text-muted" aria-hidden />
      <span className={`num flex font-display text-[28px] leading-none font-bold ${t.endAt ? "" : "text-accent uppercase"}`} aria-label={t.endAt ? mmss(t.remaining) : "Go"}>
        {t.endAt ? (
          <>
            <SlidingNumber value={Math.floor(t.remaining / 60)} />:
            <SlidingNumber value={t.remaining % 60} padStart />
          </>
        ) : (
          "Go"
        )}
      </span>
      <span className="text-xs text-muted">{t.endAt ? "rest" : "rest done"}</span>
    </span>
  );
  // Springs up when a rest starts and drops away when it ends.
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="dock"
          className="mb-2"
          role="timer"
          aria-label="Rest timer"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: "spring", bounce: 0.15, visualDuration: 0.3 }}
        >
          <div className="glass-control flex h-14 items-center justify-between overflow-hidden pr-1.5 pl-5">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-full origin-left bg-accent-soft transition-transform duration-300 ease-linear"
              style={{ transform: `scaleX(${pct})` }}
            />
            <span className="relative">{linkToWorkout ? <Link href="/workout">{time}</Link> : time}</span>
            {t.endAt && (
              <span className="relative flex gap-1">
                <button className="btn btn-icon num min-h-11 bg-transparent text-sm" onClick={() => t.add(-15)} aria-label="15 seconds less">
                  −15
                </button>
                <button className="btn btn-icon num min-h-11 bg-transparent text-sm" onClick={() => t.add(15)} aria-label="15 seconds more">
                  +15
                </button>
                <button className="btn min-h-11 bg-surface px-3 text-sm" onClick={t.stop}>
                  Skip
                </button>
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// On iPhone, Safari can clear data for sites that aren't on the home screen,
// so nudge the user to install once.
function InstallHint() {
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return false;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone || matchMedia("(display-mode: standalone)").matches;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("lift-log:install-dismissed") === "1";
    } catch {}
    return ios && !standalone && !dismissed;
  });
  if (!show) return null;
  return (
    <div className="animate-enter mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-accent-soft p-3 text-sm">
      <Share size={18} className="mt-0.5 shrink-0 text-accent" />
      <p className="flex-1">
        Add LiftLog to your home screen so your logs stay safe on this iPhone: tap <b>Share</b>, then <b>Add to Home Screen</b>.
      </p>
      <button
        className="-m-2 flex size-10 shrink-0 items-center justify-center text-muted"
        aria-label="Dismiss"
        onClick={() => {
          setShow(false);
          try {
            localStorage.setItem("lift-log:install-dismissed", "1");
          } catch {}
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
