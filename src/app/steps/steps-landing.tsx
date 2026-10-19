"use client";

import { Check, Footprints, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInCard } from "@/components/sign-in";
import { dateKey } from "@/lib/dates";
import { saveSteps } from "@/lib/repo";
import { parseSteps } from "@/lib/steps";
import { supabase, syncConfigured, syncNow } from "@/lib/sync";

type State = { kind: "saving" } | { kind: "bad" } | { kind: "saved"; steps: number; synced: boolean };

// Where the iPhone Shortcut lands: /steps?count=8123 (optionally &date=).
// Shortcuts open links in Safari, not the home-screen app, so this saves the
// count here and syncs it; the app picks it up on its next sync.
export function StepsLanding() {
  const [state, setState] = useState<State>({ kind: "saving" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const steps = parseSteps(params.get("count"));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : dateKey();
    if (steps === null) {
      // Deferred so the state update doesn't run synchronously in the effect.
      queueMicrotask(() => setState({ kind: "bad" }));
      return;
    }
    void (async () => {
      await saveSteps(date, steps);
      const sb = await supabase();
      const signedIn = Boolean(sb && (await sb.auth.getSession()).data.session);
      if (signedIn) await syncNow();
      setState({ kind: "saved", steps, synced: signedIn });
    })();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="card p-6 text-center">
        {state.kind === "bad" ? (
          <>
            <TriangleAlert size={32} className="mx-auto text-pr" aria-hidden />
            <h1 className="title mt-3">No steps found</h1>
            <p className="mt-2 text-sm text-muted">The link needs a step count, like /steps?count=8123. Check the Shortcut puts the Sum right after &ldquo;count=&rdquo;.</p>
          </>
        ) : state.kind === "saving" ? (
          <>
            <Footprints size={32} className="mx-auto text-accent" aria-hidden />
            <h1 className="title mt-3">Saving…</h1>
          </>
        ) : (
          <>
            <Check size={32} className="mx-auto text-accent" aria-hidden />
            <h1 className="title mt-3">{state.steps.toLocaleString("en-IN")} steps</h1>
            <p className="mt-2 text-sm text-muted">
              {state.synced ? "Saved and synced. Open LiftLog to see them." : "Saved here. Sign in below so they sync to the LiftLog app on your home screen."}
            </p>
          </>
        )}
      </div>
      {state.kind === "saved" && !state.synced && syncConfigured && (
        <div className="card mt-4 p-4">
          <SignInCard title="Sign in to sync your steps" />
        </div>
      )}
      <Link href="/food" className="btn btn-ghost mt-4">
        Open LiftLog
      </Link>
    </div>
  );
}
