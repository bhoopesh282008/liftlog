"use client";

import type { Session } from "@supabase/supabase-js";
import { useLiveQuery } from "dexie-react-hooks";
import { Cloud, CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { DEMO_FLAG } from "@/lib/demo";
import { Sheet } from "@/components/ui";
import { deleteAccount, requestPasswordReset, signOut, supabase, syncConfigured, syncNow } from "@/lib/sync";

// Email + password, entirely inside the app. Emailed links open in Safari,
// not the iPhone home-screen app, so the session would land in the wrong
// place; Supabase's default email can't carry a code without custom SMTP.
// Email confirmation is off in the Supabase project, so a new account
// signs straight in. The one emailed link is the password reset: it opens
// /reset in Safari, you pick a new password there, then sign in here.
const MIN_PASSWORD = 8;

export function SignInCard({ compact = false, title = "Sync across devices" }: { compact?: boolean; title?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const lastSync = useLiveQuery(async () => (await db.meta.get("lastSyncAt"))?.value as number | undefined, []);
  const demo = useLiveQuery(async () => (await db.meta.get(DEMO_FLAG))?.value === true, []);

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

  if (demo) {
    return (
      <div className="flex gap-3 text-sm">
        <CloudOff size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        <p className="text-muted">You&apos;re in the demo, so sync is off. Tap Start fresh at the top to set up your own data, then sign in.</p>
      </div>
    );
  }

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
          <button className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        {msg && <p className="text-muted">{msg}</p>}
        <button type="button" className="btn btn-ghost w-full text-sm text-danger" onClick={() => setDeleting(true)}>
          <Trash2 size={16} aria-hidden /> Delete account
        </button>
        <DeleteAccountSheet open={deleting} onClose={() => setDeleting(false)} onDeleted={setMsg} />
      </div>
    );
  }

  const valid = email.includes("@") && (mode === "forgot" || password.length >= (mode === "signup" ? MIN_PASSWORD : 1));
  return (
    <form
      className={compact ? "rounded-2xl border border-line p-4 text-left" : ""}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg("");
        if (mode === "forgot") {
          const error = await requestPasswordReset(email);
          setMsg(
            error
              ? /rate limit/i.test(error)
                ? "Too many reset emails just now. Wait an hour and try again."
                : error
              : "If that email has an account, a reset link is on its way. It opens in Safari: set a new password there, then sign in here.",
          );
          if (!error) setMode("signin");
          setBusy(false);
          return;
        }
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
      {mode !== "forgot" && (
        <>
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
        </>
      )}
      <button className="btn btn-primary mt-3 w-full" disabled={busy || !valid} type="submit">
        {busy ? "One moment…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Email me a reset link" : "Sign in"}
      </button>
      {mode === "signin" && (
        <button
          type="button"
          className="btn btn-ghost mt-1 w-full text-sm"
          onClick={() => {
            setMode("forgot");
            setMsg("");
          }}
        >
          Forgot password?
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost mt-1 w-full text-sm"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setMsg("");
        }}
      >
        {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
      {msg && (
        <p className="mt-2 text-sm text-muted" aria-live="polite">
          {msg}
        </p>
      )}
    </form>
  );
}

function DeleteAccountSheet({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: (msg: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    setPassword("");
    setError("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Delete account">
      <form
        className="space-y-3 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const r = await deleteAccount(password);
          setBusy(false);
          if (r.ok) {
            close();
            onDeleted("Account deleted. Your synced data is gone from the cloud; everything is still on this device.");
          } else if (r.dataGone) {
            close();
            onDeleted(`Your synced data was deleted, but the account itself couldn't be removed (${r.error}).`);
          } else {
            setError(r.error);
          }
        }}
      >
        <p>This deletes your sync account and every workout, meal and weigh-in stored in the cloud. Other devices stop syncing. It can&apos;t be undone.</p>
        <p className="text-muted">Your data stays on this device. Export a backup first if you want a copy.</p>
        <label className="label mb-1 block" htmlFor="delete-password">
          Enter your password to confirm
        </label>
        <input
          id="delete-password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="text-danger" aria-live="polite">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn btn-ghost flex-1" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary flex-1" disabled={busy || !password}>
            {busy ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
