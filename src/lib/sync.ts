import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "./db";
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
