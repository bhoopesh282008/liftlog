"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import type { ChatMessage, Proposal } from "./coach";
import { db } from "./db";
import { supabase, syncConfigured } from "./sync";

// Whether this account may use the coach. The server decides (its allow
// list); the answer is remembered on the device so the tab doesn't flicker.
const KEY = "coachEnabled";

async function token(): Promise<string | null> {
  const sb = await supabase();
  if (!sb) return null;
  return (await sb.auth.getSession()).data.session?.access_token ?? null;
}

async function refresh() {
  const t = await token();
  if (!t) return void db.meta.put({ key: KEY, value: false });
  try {
    const res = await fetch("/api/assistant", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
    if (res.ok) await db.meta.put({ key: KEY, value: Boolean(((await res.json()) as { enabled?: boolean }).enabled) });
  } catch {
    // Offline: keep the last answer.
  }
}

export function useCoachEnabled(): boolean {
  const enabled = useLiveQuery(async () => (await db.meta.get(KEY))?.value === true, []);
  useEffect(() => {
    if (!syncConfigured) return;
    void refresh();
    let unsub: (() => void) | undefined;
    void supabase().then((sb) => {
      const { data } = sb!.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") void refresh();
      });
      unsub = () => data.subscription.unsubscribe();
    });
    return () => unsub?.();
  }, []);
  return Boolean(enabled);
}

export async function askCoach(messages: ChatMessage[], context: string): Promise<{ text: string; proposal: Proposal | null }> {
  const t = await token();
  if (!t) throw new Error("Sign in to use the coach.");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("The coach needs a connection.");
  const res = await fetch("/api/assistant", {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ messages, context }),
  });
  const body = (await res.json().catch(() => ({}))) as { text?: string; proposal?: Proposal | null; error?: string };
  if (!res.ok || !body.text) throw new Error(body.error ?? "The coach is unavailable right now.");
  return { text: body.text, proposal: body.proposal ?? null };
}
