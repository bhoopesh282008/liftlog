"use client";

import { Check, KeyRound, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/sync";

const MIN_PASSWORD = 8;

type State = { kind: "checking" } | { kind: "form" } | { kind: "done" } | { kind: "bad"; reason: string };

// Where the password-reset email lands. It opens in Safari, not the
// home-screen app, so this page only sets the new password; you then sign
// in with it inside the app. Supabase puts the recovery session (or an
// error) in the URL hash, and the client picks it up on load.
export function ResetPassword() {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const linkError = hash.get("error_code") ?? hash.get("error");
    let cancelled = false;
    void (async () => {
      const sb = await supabase();
      if (cancelled) return;
      if (!sb) return setState({ kind: "bad", reason: "Sync isn't set up on this build, so there's no password to reset." });
      if (linkError) {
        return setState({
          kind: "bad",
          reason: /expired/i.test(linkError) ? "This reset link has expired or was already used. Ask for a new one from LiftLog." : (hash.get("error_description") ?? linkError),
        });
      }
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      setState(data.session ? { kind: "form" } : { kind: "bad", reason: "Open this page from the reset link in your email." });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="card p-6">
        {state.kind === "checking" ? (
          <div className="text-center">
            <KeyRound size={32} className="mx-auto text-accent" aria-hidden />
            <h1 className="title mt-3">One moment…</h1>
          </div>
        ) : state.kind === "bad" ? (
          <div className="text-center">
            <TriangleAlert size={32} className="mx-auto text-pr" aria-hidden />
            <h1 className="title mt-3">Can&apos;t reset</h1>
            <p className="mt-2 text-sm text-muted">{state.reason}</p>
          </div>
        ) : state.kind === "done" ? (
          <div className="text-center">
            <Check size={32} className="mx-auto text-accent" aria-hidden />
            <h1 className="title mt-3">Password changed</h1>
            <p className="mt-2 text-sm text-muted">Open LiftLog from your home screen and sign in with the new password under Settings → Account.</p>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const sb = await supabase();
              const r = await sb!.auth.updateUser({ password });
              setBusy(false);
              if (r.error) setError(/different from the old/i.test(r.error.message) ? "Pick a password you haven't used here before." : r.error.message);
              else {
                setPassword("");
                window.history.replaceState(null, "", "/reset");
                setState({ kind: "done" });
              }
            }}
          >
            <KeyRound size={32} className="mx-auto text-accent" aria-hidden />
            <h1 className="title mt-3 text-center">New password</h1>
            <label className="label mt-4 mb-1 block" htmlFor="new-password">
              Password ({MIN_PASSWORD}+ characters)
            </label>
            <input
              id="new-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn btn-primary mt-3 w-full" type="submit" disabled={busy || password.length < MIN_PASSWORD}>
              {busy ? "Saving…" : "Save password"}
            </button>
            {error && (
              <p className="mt-2 text-sm text-danger" aria-live="polite">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
      <Link href="/settings" className="btn btn-ghost mt-4 self-center text-sm">
        Open LiftLog
      </Link>
    </div>
  );
}
