import type { NitfreeDatabase } from "./schema";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gif, png } from "~/lib/media/fixtures";

import { hashBytes } from "./library";
import { LEGACY_DATABASE_NAME, migrateLegacyDatabase } from "./migrate";
import { createTags } from "./tags";
import { openTestDatabase } from "./testing";



let db: NitfreeDatabase;

/**
 * Recreates the Vue version's database exactly as it opened it: raw IndexedDB, version 1,
 * three object stores keyed by "id".
 *
 * @param seed - Rows to write into each store.
 * @param seed.Tags - Tag rows.
 * @param seed.Files - File rows.
 * @param seed.Metadata - Metadata rows.
 * @returns Resolves once the rows are written and the database is closed.
 */
async function createLegacyDatabase(seed: { Tags?: object[]; Files?: object[]; Metadata?: object[] }): Promise<void> {
  const raw = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      for (const name of ["Tags", "Files", "Metadata"]) {
        request.result.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  await new Promise<void>((resolve, reject) => {
    const transaction = raw.transaction(["Tags", "Files", "Metadata"], "readwrite");

    for (const [name, rows] of Object.entries(seed)) {
      for (const row of rows) {
        transaction.objectStore(name).put(row);
      }
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  raw.close();
}

beforeEach(async () => {
  db = await openTestDatabase();
});

afterEach(async () => {
  await Dexie.delete(LEGACY_DATABASE_NAME);
});

describe("migrateLegacyDatabase", () => {
  it("does nothing without an old database", async () => {
    expect(await migrateLegacyDatabase(db)).toBeNull();
    expect(await Dexie.exists(LEGACY_DATABASE_NAME)).toBe(false);
  });

  it("copies items, files and tags, then deletes the old database", async () => {
    const created = new Date(2025, 1, 15);
    const updated = new Date(2025, 1, 16);
    const still = png(32, 32);
    const animated = gif(48, 48, 4);

    await createLegacyDatabase({
      Tags: [{ id: "t-other", name: "Other", description: null, createdOn: created, updatedOn: created }],
      Files: [
        { id: "f-1", data: new Blob([still], { type: "image/png" }), createdOn: created, updatedOn: created },
        { id: "f-2", data: new Blob([animated]), createdOn: created, updatedOn: created },
      ],
      Metadata: [
        { id: "m-1", fileId: "f-1", tagId: "t-other", title: " Wave ", favorite: true, description: "hi", createdOn: created, updatedOn: updated },
        { id: "m-2", fileId: "f-2", tagId: null, title: "", favorite: false, description: "", createdOn: created, updatedOn: created },
      ],
    });

    expect(await migrateLegacyDatabase(db, () => 5)).toEqual({ items: 2, tags: 1, skipped: 0 });
    expect(await Dexie.exists(LEGACY_DATABASE_NAME)).toBe(false);

    const wave = await db.items.get("m-1");

    expect(wave).toMatchObject({
      type: "image",
      title: "Wave",
      description: "hi",
      tags: ["t-other"],
      favorite: 1,
      hash: await hashBytes(still),
      width: 32,
      animated: false,
      createdAt: created.getTime(),
      updatedAt: updated.getTime(),
      usedAt: null,
      usageCount: 0,
    });
    expect(await db.items.get("m-2")).toMatchObject({ type: "gif", title: "Untitled", tags: [], favorite: 0, animated: true });
    expect((await db.blobs.get("m-2"))?.original.type).toBe("image/gif");
    expect(await db.tags.get("t-other")).toMatchObject({ name: "Other", key: "other", color: null, createdAt: created.getTime() });
  });

  it("skips entries whose file is missing or unreadable, and merges tags whose name is taken", async () => {
    const existing = await createTags(db).add({ name: "OTHER" });

    await createLegacyDatabase({
      Tags: [{ id: "t-other", name: "other" }],
      Files: [{ id: "f-1", data: new Blob([png(8, 8)]) }, { id: "f-bad", data: new Blob(["not an image"]) }],
      Metadata: [
        { id: "m-1", fileId: "f-1", tagId: "t-other", title: "ok" },
        { id: "m-2", fileId: "f-missing", title: "orphan" },
        { id: "m-3", fileId: "f-bad", title: "bad" },
      ],
    });

    expect(await migrateLegacyDatabase(db)).toEqual({ items: 1, tags: 0, skipped: 2 });
    expect((await db.items.get("m-1"))?.tags).toEqual([existing.id]);
    expect(await db.tags.count()).toBe(1);
  });

  it("runs once", async () => {
    await createLegacyDatabase({ Files: [{ id: "f-1", data: new Blob([png(8, 8)]) }], Metadata: [{ id: "m-1", fileId: "f-1", title: "a" }] });

    expect(await migrateLegacyDatabase(db)).toMatchObject({ items: 1 });
    expect(await migrateLegacyDatabase(db)).toBeNull();
    expect(await db.items.count()).toBe(1);
  });
});
