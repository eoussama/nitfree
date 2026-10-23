import type { NitfreeDatabase } from "./schema";
import type { TBlobRow, TItemRow, TTagRow } from "./types";

import Dexie from "dexie";

import { inspectFile } from "./library";
import { tagKey } from "./tags";



/**
 * The database the Vue version opened from its background script, in the extension's origin.
 */
export const LEGACY_DATABASE_NAME = "nitfree";

type TLegacyTag = { id: string; name: string; createdOn?: Date };
type TLegacyFile = { id: string; data: Blob };
type TLegacyMetadata = {
  id: string;
  fileId: string;
  tagId?: string | null;
  title?: string;
  description?: string;
  favorite?: boolean;
  createdOn?: Date;
  updatedOn?: Date;
};

/**
 * Written in the same transaction as the copied rows, so an interrupted run never copies twice.
 */
export const MIGRATED_KEY = "legacy-migrated";

export type TMigrationResult = { items: string[]; tags: string[]; skipped: number };



function time(value: unknown, fallback: number): number {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.getTime() : fallback;
}

async function readTable<T>(legacy: Dexie, name: string): Promise<T[]> {
  return legacy.tables.some(table => table.name === name) ? legacy.table<T>(name).toArray() : [];
}

/**
 * Copies the previous version's library into the current database once, then deletes the old database.
 * Safe to run on every start: it does nothing when there is no old database, a run that fails before
 * copying leaves the old database in place to retry, and a run interrupted after copying only finishes
 * deleting the old database next time, so later edits are never overwritten.
 *
 * @param db - The library database.
 * @param now - Clock, replaceable in tests.
 * @returns The ids of the copied items and tags, or null when there was nothing to migrate.
 */
export async function migrateLegacyDatabase(db: NitfreeDatabase, now: () => number = Date.now): Promise<TMigrationResult | null> {
  if (!(await Dexie.exists(LEGACY_DATABASE_NAME))) {
    return null;
  }

  if (await db.meta.get(MIGRATED_KEY)) {
    await Dexie.delete(LEGACY_DATABASE_NAME);

    return null;
  }

  const legacy = new Dexie(LEGACY_DATABASE_NAME);

  await legacy.open();

  const [legacyTags, legacyFiles, legacyMetadata] = await Promise.all([
    readTable<TLegacyTag>(legacy, "Tags"),
    readTable<TLegacyFile>(legacy, "Files"),
    readTable<TLegacyMetadata>(legacy, "Metadata"),
  ]);

  legacy.close();

  const timestamp = now();
  const files = new Map(legacyFiles.map(file => [file.id, file.data]));
  const items: TItemRow[] = [];
  const blobs: TBlobRow[] = [];
  let skipped = 0;

  // Inspecting and hashing is asynchronous work that cannot run inside an IndexedDB transaction.
  for (const metadata of legacyMetadata) {
    const data = files.get(metadata.fileId);
    const inspected = data instanceof Blob ? await inspectFile(data).catch(() => null) : null;

    if (!inspected || typeof metadata.id !== "string") {
      skipped++;
      continue;
    }

    const createdAt = time(metadata.createdOn, timestamp);

    items.push({
      id: metadata.id,
      type: inspected.animated && inspected.format === "gif" ? "gif" : "image",
      title: (typeof metadata.title === "string" && metadata.title.trim()) || "Untitled",
      description: typeof metadata.description === "string" ? metadata.description.trim() : "",
      tags: typeof metadata.tagId === "string" ? [metadata.tagId] : [],
      packs: [],
      favorite: metadata.favorite ? 1 : 0,
      hash: inspected.hash,
      size: inspected.size,
      format: inspected.format,
      mime: inspected.mime,
      width: inspected.width,
      height: inspected.height,
      animated: inspected.animated,
      createdAt,
      updatedAt: time(metadata.updatedOn, createdAt),
      usedAt: null,
      usageCount: 0,
    });
    blobs.push({ itemId: metadata.id, original: inspected.file, variants: {} });
  }

  const result = await db.transaction("rw", [db.items, db.blobs, db.tags, db.meta], async (): Promise<TMigrationResult | null> => {
    if (await db.meta.get(MIGRATED_KEY)) {
      return null;
    }

    // Tags are unique by name: an old tag whose name is taken merges into the existing one.
    const tagIds = new Map<string, string>();
    const tags: TTagRow[] = [];

    for (const tag of legacyTags) {
      const name = typeof tag.name === "string" ? tag.name.trim().replace(/\s+/g, " ") : "";

      if (!name) {
        continue;
      }

      const key = tagKey(name);
      const existing = tags.find(row => row.key === key) ?? await db.tags.where("key").equals(key).first();

      if (existing) {
        tagIds.set(tag.id, existing.id);
        continue;
      }

      tagIds.set(tag.id, tag.id);
      tags.push({ id: tag.id, name, key, color: null, createdAt: time(tag.createdOn, timestamp) });
    }

    for (const item of items) {
      item.tags = item.tags.flatMap(id => tagIds.get(id) ?? []);
    }

    await db.tags.bulkPut(tags);
    await db.items.bulkPut(items);
    await db.blobs.bulkPut(blobs);
    await db.meta.put({ key: MIGRATED_KEY, value: timestamp });

    return { items: items.map(item => item.id), tags: tags.map(tag => tag.id), skipped };
  });

  await Dexie.delete(LEGACY_DATABASE_NAME);

  return result;
}
