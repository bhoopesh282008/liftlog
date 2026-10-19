"use client";

import type { Session } from "@supabase/supabase-js";
import { useLiveQuery } from "dexie-react-hooks";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { supabase, syncConfigured, syncNow } from "@/lib/sync";

// Sign-in uses a 6-digit email code rather than a magic link: on iPhone a
// link opens in Safari, not the home-screen app, so the session would land
// in the wrong place.
export function SignInCard({ compact = false, title = "Sync across devices" }: { compact?: boolean; title?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
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

  return (
    <form
      className={compact ? "rounded-2xl border border-line p-4 text-left" : ""}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg("");
        if (stage === "email") {
          const { error } = await (await auth()).signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
          if (error) setMsg(error.message);
          else {
            setStage("code");
            setMsg(`We sent a code to ${email.trim()}.`);
          }
        } else {
          const { error } = await (await auth()).verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
          if (error) setMsg("That code didn't work. Check it and try again.");
          else void syncNow();
        }
        setBusy(false);
      }}
    >
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {stage === "email" ? (
        <input className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      ) : (
        <input className="input num tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
      )}
      <button className="btn mt-2 w-full" disabled={busy || (stage === "email" ? !email.includes("@") : code.trim().length < 6)} type="submit">
        {stage === "email" ? "Email me a sign-in code" : "Sign in"}
      </button>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </form>
  );
}
