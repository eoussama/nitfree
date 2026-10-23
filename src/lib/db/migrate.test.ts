import type { NitfreeDatabase } from "./schema";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gif, png } from "~/lib/media/fixtures";

import { createLibrary, hashBytes } from "./library";
import { LEGACY_DATABASE_NAME, MIGRATED_KEY, migrateLegacyDatabase } from "./migrate";
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
 * @param stores - The stores to make, all three unless told otherwise.
 * @returns Resolves once the rows are written and the database is closed.
 */
async function createLegacyDatabase(seed: { Tags?: object[]; Files?: object[]; Metadata?: object[] }, stores: string[] = ["Tags", "Files", "Metadata"]): Promise<void> {
  const raw = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      for (const name of stores) {
        request.result.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  await new Promise<void>((resolve, reject) => {
    const transaction = raw.transaction(stores, "readwrite");

    for (const [name, rows] of Object.entries(seed).filter(([name]) => stores.includes(name))) {
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

    expect(await migrateLegacyDatabase(db, () => 5)).toEqual({ items: ["m-1", "m-2"], tags: ["t-other"], skipped: 0 });
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

    expect(await migrateLegacyDatabase(db)).toEqual({ items: ["m-1"], tags: [], skipped: 2 });
    expect((await db.items.get("m-1"))?.tags).toEqual([existing.id]);
    expect(await db.tags.count()).toBe(1);
  });

  it("copies what an old database has even when it lacks a store", async () => {
    await createLegacyDatabase({ Files: [{ id: "f-1", data: new Blob([png(8, 8)]) }], Metadata: [{ id: "m-1", fileId: "f-1", title: "a" }] }, ["Files", "Metadata"]);

    expect(await migrateLegacyDatabase(db)).toEqual({ items: ["m-1"], tags: [], skipped: 0 });
  });

  it("makes do with what is missing or odd in the old rows", async () => {
    const created = new Date("2020-01-02T03:04:05Z");

    await createLegacyDatabase({
      Tags: [
        { id: "t-1", name: "  Cats  ", createdOn: created },
        { id: "t-2", name: "cats" },
        { id: "t-3", name: "   " },
        { id: "t-4" },
      ],
      Files: [{ id: "f-1", data: new Blob([png(8, 8)]) }, { id: "f-2", data: new Blob([png(9, 9)]) }, { id: "f-3", data: new Blob([png(7, 7)]) }, { id: "f-4", data: new Blob([png(6, 6)]) }],
      Metadata: [
        { id: "m-1", fileId: "f-1", tagId: "t-2", title: "  ", description: 5, favorite: true, createdOn: new Date(Number.NaN) },
        { id: "m-2", fileId: "f-2", tagId: null, title: "named", description: " about " },
        { id: 3, fileId: "f-3", title: "numbered" },
        { id: "m-4", fileId: "f-4", tagId: "t-3", title: "dropped tag" },
      ],
    });

    expect(await migrateLegacyDatabase(db, () => 1000)).toEqual({ items: ["m-1", "m-2", "m-4"], tags: ["t-1"], skipped: 1 });
    // Blank and nameless tags are dropped, and a second spelling of a name joins the first.
    expect(await db.tags.toArray()).toMatchObject([{ id: "t-1", name: "Cats", createdAt: created.getTime() }]);
    expect(await db.items.get("m-1")).toMatchObject({ title: "Untitled", description: "", favorite: 1, tags: ["t-1"], createdAt: 1000, updatedAt: 1000 });
    expect(await db.items.get("m-2")).toMatchObject({ title: "named", description: "about", favorite: 0, tags: [] });
    // Its tag was one of those dropped.
    expect((await db.items.get("m-4"))?.tags).toEqual([]);
  });

  it("copies nothing when another start finished the job between the look and the copy", async () => {
    await createLegacyDatabase({ Files: [{ id: "f-1", data: new Blob([png(8, 8)]) }], Metadata: [{ id: "m-1", fileId: "f-1", title: "a" }] });
    await db.meta.put({ key: MIGRATED_KEY, value: 1 });
    vi.spyOn(db.meta, "get").mockImplementationOnce((async () => undefined) as never);

    expect(await migrateLegacyDatabase(db)).toBeNull();
    expect(await db.items.count()).toBe(0);
  });

  it("runs once", async () => {
    await createLegacyDatabase({ Files: [{ id: "f-1", data: new Blob([png(8, 8)]) }], Metadata: [{ id: "m-1", fileId: "f-1", title: "a" }] });

    expect(await migrateLegacyDatabase(db)).toMatchObject({ items: ["m-1"] });
    expect(await migrateLegacyDatabase(db)).toBeNull();
    expect(await db.items.count()).toBe(1);
  });

  it("never copies again after a run that copied but could not delete the old database", async () => {
    const seed = {
      Tags: [{ id: "t-1", name: "Cats" }],
      Files: [{ id: "f-1", data: new Blob([png(8, 8)]) }, { id: "f-2", data: new Blob([png(9, 9)]) }],
      Metadata: [{ id: "m-1", fileId: "f-1", tagId: "t-1", title: "a" }, { id: "m-2", fileId: "f-2", title: "b" }],
    };

    await createLegacyDatabase(seed);
    await migrateLegacyDatabase(db);

    const library = createLibrary(db);

    await library.update("m-1", { title: "edited", favorite: true });
    await library.use("m-1");
    await library.remove("m-2");
    await createTags(db).remove("t-1");

    // The old database is back, as if deleting it had failed after the copy committed.
    await createLegacyDatabase(seed);

    expect(await migrateLegacyDatabase(db)).toBeNull();
    expect(await Dexie.exists(LEGACY_DATABASE_NAME)).toBe(false);
    expect(await library.get("m-1")).toMatchObject({ title: "edited", favorite: true, usageCount: 1, tags: [] });
    expect(await library.get("m-2")).toBeNull();
    expect(await db.tags.count()).toBe(0);
  });
});
