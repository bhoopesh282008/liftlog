"use client";

import type { Session } from "@supabase/supabase-js";
import { useLiveQuery } from "dexie-react-hooks";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { supabase, syncConfigured, syncNow } from "@/lib/sync";

// Email + password, entirely inside the app. Emailed links open in Safari,
// not the iPhone home-screen app, so the session would land in the wrong
// place; Supabase's default email can't carry a code without custom SMTP.
// Email confirmation is off in the Supabase project, so a new account
// signs straight in.
const MIN_PASSWORD = 8;

export function SignInCard({ compact = false, title = "Sync across devices" }: { compact?: boolean; title?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const lastSync = useLiveQuery(async () => (await db.meta.get("lastSyncAt"))?.value as number | undefined, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    void supabase().then((sb) => {
      if (!sb || cancelled) return;
      void sb.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!syncConfigured) {
    return (
      <div className="flex gap-3 text-sm">
        <CloudOff size={18} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-muted">
          Your data is saved on this device. To sync your phone and laptop, add your Supabase keys (see the README) and sign in here.
        </p>
      </div>
    );
  }

  const auth = async () => (await supabase())!.auth;

  if (session) {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex gap-3">
          <Cloud size={18} className="mt-0.5 shrink-0 text-accent" />
          <div className="flex-1">
            <p>Signed in as {session.user.email}</p>
            <p className="text-muted">
              {pending ? `${pending} change${pending > 1 ? "s" : ""} waiting to sync` : "Everything is synced"}
              {lastSync ? ` · last synced ${new Date(lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await syncNow();
              setMsg(r.error ? `Sync failed: ${r.error}` : "Synced");
              setBusy(false);
            }}
          >
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> Sync now
          </button>
          <button className="btn btn-ghost" onClick={() => void auth().then((a) => a.signOut())}>
            Sign out
          </button>
        </div>
        {msg && <p className="text-muted">{msg}</p>}
      </div>
    );
  }

  const valid = email.includes("@") && password.length >= (mode === "signup" ? MIN_PASSWORD : 1);
  return (
    <form
      className={compact ? "rounded-2xl border border-line p-4 text-left" : ""}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg("");
        const a = await auth();
        const creds = { email: email.trim(), password };
        const { data, error } = mode === "signup" ? await a.signUp(creds) : await a.signInWithPassword(creds);
        if (error) {
          setMsg(
            /invalid login/i.test(error.message)
              ? "That email and password don't match. Check them, or create an account."
              : /already registered/i.test(error.message)
                ? "That email already has an account. Sign in instead."
                : error.message,
          );
        } else if (data.session) {
          setPassword("");
          void syncNow();
        } else {
          setMsg("Account created. Sign in to start syncing.");
          setMode("signin");
        }
        setBusy(false);
      }}
    >
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <label className="label mb-1 block" htmlFor="sync-email">
        Email
      </label>
      <input
        id="sync-email"
        name="email"
        className="input"
        type="email"
        autoComplete="email"
        spellCheck={false}
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="label mt-2 mb-1 block" htmlFor="sync-password">
        Password{mode === "signup" && ` (${MIN_PASSWORD}+ characters)`}
      </label>
      <input
        id="sync-password"
        name="password"
        className="input"
        type="password"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="btn btn-primary mt-3 w-full" disabled={busy || !valid} type="submit">
        {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <button
        type="button"
        className="btn btn-ghost mt-1 w-full text-sm"
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setMsg("");
        }}
      >
        {mode === "signup" ? "Have an account? Sign in" : "New here? Create an account"}
      </button>
      {msg && (
        <p className="mt-2 text-sm text-muted" aria-live="polite">
          {msg}
        </p>
      )}
    </form>
  );
}
