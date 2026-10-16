"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChartLine, Dumbbell, Settings, Share, Timer, Utensils, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { db, PROFILE_ID } from "@/lib/db";
import { CHANGE_EVENT, closeStaleWorkouts, runAutoAdjust } from "@/lib/repo";
import { supabase, syncNow } from "@/lib/sync";
import { mmss, RestTimerProvider, useRestTimer } from "./rest-timer";
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
export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!hydrated) return <div className="min-h-dvh" />;
  return (
    <ToastProvider>
      <RestTimerProvider>
        <Gate>{children}</Gate>
      </RestTimerProvider>
    </ToastProvider>
  );
}

function Gate({ children }: { children: ReactNode }) {
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

  if (profile === undefined || (needsOnboarding && !onboarding) || (!needsOnboarding && pathname === "/")) {
    return <div className="min-h-dvh" />;
  }
  if (onboarding) return <main className="pt-safe mx-auto min-h-dvh w-full max-w-lg">{children}</main>;

  return (
    <>
      <main className="pt-safe pb-nav mx-auto min-h-dvh w-full max-w-2xl">
        <InstallHint />
        {children}
      </main>
      <FloatingTimer hidden={pathname.startsWith("/workout")} />
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/85 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-2xl">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150 ${
                  active ? "text-accent" : "text-faint"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={22} strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </Link>
            );
          })}
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
    const sb = supabase();
    if (!sb) return;
    let debounce: ReturnType<typeof setTimeout>;
    const soon = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void syncNow(), 1500);
    };
    void syncNow();
    window.addEventListener(CHANGE_EVENT, soon);
    window.addEventListener("online", soon);
    const every = setInterval(() => document.visibilityState === "visible" && void syncNow(), 60_000);
    const { data } = sb.auth.onAuthStateChange(() => soon());
    return () => {
      clearTimeout(debounce);
      clearInterval(every);
      window.removeEventListener(CHANGE_EVENT, soon);
      window.removeEventListener("online", soon);
      data.subscription.unsubscribe();
    };
  }, []);
}

function FloatingTimer({ hidden }: { hidden: boolean }) {
  const timer = useRestTimer();
  if (hidden || !timer.endAt) return null;
  return (
    <Link
      href="/workout"
      className="animate-enter num fixed right-4 z-40 flex min-h-11 items-center gap-2 rounded-full bg-text px-4 text-sm font-semibold text-bg shadow-lg"
      style={{ bottom: "calc(80px + env(safe-area-inset-bottom))" }}
    >
      <Timer size={16} /> {mmss(timer.remaining)}
    </Link>
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
