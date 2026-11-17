import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { resetSyncState } from "./sync";

describe("resetSyncState", () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it("forgets the pull cursor and queues every local row for the next account", async () => {
    await db.meta.bulkPut([
      { key: "pullCursor", value: "2026-11-01T00:00:00Z" },
      { key: "lastSyncAt", value: 123 },
      { key: "theme", value: "dark" },
    ]);
    await db.table("weights").bulkPut([
      { id: "w1", date: "2026-11-01", kg: 70, updatedAt: 1 },
      { id: "w2", date: "2026-11-02", kg: 70.4, updatedAt: 2, deletedAt: 3 },
    ]);
    await db.table("foods").put({ id: "f1", name: "Paneer", updatedAt: 1 });
    await db.outbox.add({ table: "weights", rowId: "w1" });

    await resetSyncState();

    expect(await db.meta.get("pullCursor")).toBeUndefined();
    expect(await db.meta.get("lastSyncAt")).toBeUndefined();
    expect((await db.meta.get("theme"))?.value).toBe("dark");
    const queued = (await db.outbox.toArray()).map((q) => `${q.table}:${q.rowId}`).sort();
    // Deleted rows are queued too, so their tombstones reach the new account.
    expect(queued).toEqual(["foods:f1", "weights:w1", "weights:w2"]);
  });
});
