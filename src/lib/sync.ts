import type { SupabaseClient } from "@supabase/supabase-js";
import { db, SYNCED_TABLES } from "./db";
import type { SyncedTable } from "./types";

// Sync is optional: with no Supabase keys the app runs fully on-device.
// With keys, every change is stored as one row in `user_records` and merged
// across devices by last write wins on `updatedAt`.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const syncConfigured = Boolean(url && anonKey);

// The Supabase client (~60 KB gzipped) loads only when sync is configured,
// so on-device-only installs never download it.
let client: Promise<SupabaseClient> | null = null;
export function supabase(): Promise<SupabaseClient | null> {
  if (!syncConfigured) return Promise.resolve(null);
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } }),
  );
  return client;
}

const PAGE = 500;
let running: Promise<SyncResult> | null = null;

export interface SyncResult {
  pushed: number;
  pulled: number;
  error?: string;
}

export function syncNow(): Promise<SyncResult> {
  running ??= doSync().finally(() => {
    running = null;
  });
  return running;
}

async function doSync(): Promise<SyncResult> {
  const sb = await supabase();
  if (!sb) return { pushed: 0, pulled: 0 };
  const { data: auth } = await sb.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) return { pushed: 0, pulled: 0 };
  try {
    const pushed = await push(sb, userId);
    const pulled = await pull(sb);
    await db.meta.put({ key: "lastSyncAt", value: Date.now() });
    return { pushed, pulled };
  } catch (e) {
    return { pushed: 0, pulled: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function push(sb: SupabaseClient, userId: string): Promise<number> {
  const queued = await db.outbox.orderBy("seq").limit(PAGE).toArray();
  if (queued.length === 0) return 0;
  const unique = new Map<string, { table: SyncedTable; rowId: string }>();
  for (const q of queued) unique.set(`${q.table}:${q.rowId}`, q);
  const rows = [];
  for (const { table, rowId } of unique.values()) {
    const row = await db.table(table).get(rowId);
    if (!row) continue;
    rows.push({
      user_id: userId,
      table_name: table,
      id: rowId,
      data: row,
      updated_at: row.updatedAt,
      deleted: Boolean(row.deletedAt),
    });
  }
  if (rows.length) {
    const { error } = await sb.from("user_records").upsert(rows, { onConflict: "user_id,table_name,id" });
    if (error) throw new Error(error.message);
  }
  await db.outbox.bulkDelete(queued.map((q) => q.seq!));
  return rows.length + (queued.length === PAGE ? await push(sb, userId) : 0);
}

async function pull(sb: SupabaseClient): Promise<number> {
  let cursor = ((await db.meta.get("pullCursor"))?.value as string | undefined) ?? "1970-01-01T00:00:00Z";
  let applied = 0;
  for (;;) {
    const { data, error } = await sb
      .from("user_records")
      .select("table_name,id,data,updated_at,server_updated_at")
      .gt("server_updated_at", cursor)
      .order("server_updated_at", { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) {
      const table = db.table(r.table_name as SyncedTable);
      const local = await table.get(r.id);
      // Remote wins only when newer, so unsynced local edits are kept.
      if (!local || (local.updatedAt ?? 0) < Number(r.updated_at)) {
        await table.put(r.data);
        applied++;
      }
      cursor = r.server_updated_at;
    }
    await db.meta.put({ key: "pullCursor", value: cursor });
    if (data.length < PAGE) break;
  }
  return applied;
}

export async function pendingChanges(): Promise<number> {
  return db.outbox.count();
}

// Forget which account this device last synced with: the pull cursor
// restarts, and every local row is queued again so the next account (or the
// same one, signing back in) gets a full copy. Last write wins makes the
// re-upload harmless for an account that already has the rows.
export async function resetSyncState(): Promise<void> {
  await db.transaction("rw", [db.meta, db.outbox, ...SYNCED_TABLES.map((t) => db.table(t))], async () => {
    await db.meta.bulkDelete(["pullCursor", "lastSyncAt"]);
    await db.outbox.clear();
    for (const table of SYNCED_TABLES) {
      const ids = (await db.table(table).toCollection().primaryKeys()) as string[];
      await db.outbox.bulkAdd(ids.map((rowId) => ({ table, rowId })));
    }
  });
}

export async function signOut(): Promise<void> {
  const sb = await supabase();
  if (!sb) return;
  await sb.auth.signOut();
  await resetSyncState();
}

// The emailed link opens /reset, which sets the new password. The address
// must be listed under Authentication → URL Configuration → Redirect URLs.
export async function requestPasswordReset(email: string): Promise<string | null> {
  const sb = await supabase();
  if (!sb) return "Sync isn't set up.";
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset` });
  return error ? error.message : null;
}

export type DeleteResult = { ok: true } | { ok: false; error: string; dataGone?: boolean };

// Checks the password again first, so an unlocked phone left on a bench
// can't wipe the account. Synced rows are deleted through RLS before the
// account itself, so the cloud copy goes even if the account function
// (supabase/migrations/0002) hasn't been installed yet.
export async function deleteAccount(password: string): Promise<DeleteResult> {
  const sb = await supabase();
  if (!sb) return { ok: false, error: "Sync isn't set up." };
  const { data } = await sb.auth.getSession();
  const email = data.session?.user.email;
  const userId = data.session?.user.id;
  if (!email || !userId) return { ok: false, error: "You're not signed in." };

  const check = await sb.auth.signInWithPassword({ email, password });
  if (check.error) {
    return { ok: false, error: /invalid login/i.test(check.error.message) ? "That password isn't right." : check.error.message };
  }

  const rows = await sb.from("user_records").delete().eq("user_id", userId);
  if (rows.error) return { ok: false, error: rows.error.message };

  const account = await sb.rpc("delete_my_account");
  // The user no longer exists, so only the local session can be cleared.
  await sb.auth.signOut({ scope: "local" });
  await resetSyncState();
  if (account.error) {
    return { ok: false, dataGone: true, error: account.error.message };
  }
  return { ok: true };
}
