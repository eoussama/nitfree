import type { NitfreeDatabase } from "./schema";

import type { TImportItem, TItem, TItemPatch, TItemRow, TItemType, TNewItem } from "./types";
import type { TImageInfo } from "~/lib/media";

import { inspectImage } from "~/lib/media";

import { ITEM_TYPES } from "./types";



type TInspectedFile = TImageInfo & { file: Blob; hash: string; size: number };

export type TLibrary = ReturnType<typeof createLibrary>;



/**
 * Converts a stored row to the item the rest of the extension sees.
 *
 * @param row - The stored row.
 * @returns The item.
 */
export function toItem(row: TItemRow): TItem {
  const { favorite, ...rest } = row;

  return { ...rest, favorite: favorite === 1 };
}

/**
 * Hashes a file's content, for duplicate detection.
 *
 * @param bytes - The file's bytes.
 * @returns The SHA-256 digest as hex.
 */
export async function hashBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Reads what the library stores about a file, rejecting formats Nitfree does not accept.
 *
 * @param file - The uploaded file.
 * @returns The file, typed with its real MIME type, with its format, size, dimensions and hash.
 */
export async function inspectFile(file: Blob): Promise<TInspectedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectImage(bytes);

  if (!info) {
    throw new Error("Unsupported file: Nitfree accepts PNG, APNG, GIF, WebP and JPEG images");
  }

  return {
    ...info,
    file: file.type === info.mime ? file : new Blob([file], { type: info.mime }),
    hash: await hashBytes(bytes),
    size: file.size,
  };
}

function checkType(type: TItemType): void {
  if (!ITEM_TYPES.includes(type)) {
    throw new Error(`Unknown item type "${type}"`);
  }
}

function checkTitle(title: string): string {
  const trimmed = title.trim();

  if (!trimmed) {
    throw new Error("An item needs a title");
  }

  return trimmed;
}

/**
 * The library service: items, their files and their cached sized copies.
 * Runs in the background worker; other contexts reach it through messaging.
 *
 * @param db - The library database.
 * @param now - Clock, replaceable in tests.
 * @returns The service.
 */
export function createLibrary(db: NitfreeDatabase, now: () => number = Date.now) {
  async function checkTags(ids: readonly string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    const found = await db.tags.bulkGet(unique);
    const missing = unique.filter((_, i) => !found[i]);

    if (missing.length) {
      throw new Error(`Unknown tag ${missing.map(id => `"${id}"`).join(", ")}`);
    }

    return unique;
  }

  async function getRow(id: string): Promise<TItemRow> {
    const row = await db.items.get(id);

    if (!row) {
      throw new Error(`No item "${id}"`);
    }

    return row;
  }

  return {
    /**
     * Lists every item, newest first.
     *
     * @returns The items.
     */
    async list(): Promise<TItem[]> {
      const rows = await db.items.orderBy("createdAt").reverse().toArray();

      return rows.map(toItem);
    },

    /**
     * Finds an item.
     *
     * @param id - The item's id.
     * @returns The item, or null.
     */
    async get(id: string): Promise<TItem | null> {
      const row = await db.items.get(id);

      return row ? toItem(row) : null;
    },

    /**
     * Finds items whose file has the given content hash.
     *
     * @param hash - A SHA-256 hex digest.
     * @returns The matching items.
     */
    async findByHash(hash: string): Promise<TItem[]> {
      const rows = await db.items.where("hash").equals(hash).toArray();

      return rows.map(toItem);
    },

    /**
     * Adds a file to the library.
     *
     * @param input - The file and its details.
     * @returns The new item.
     */
    async add(input: TNewItem): Promise<TItem> {
      checkType(input.type);

      const title = checkTitle(input.title);
      const inspected = await inspectFile(input.file);
      const timestamp = now();

      return db.transaction("rw", db.items, db.blobs, db.tags, async () => {
        const row: TItemRow = {
          id: crypto.randomUUID(),
          type: input.type,
          title,
          description: input.description?.trim() ?? "",
          tags: await checkTags(input.tags ?? []),
          favorite: input.favorite ? 1 : 0,
          hash: inspected.hash,
          size: inspected.size,
          format: inspected.format,
          mime: inspected.mime,
          width: inspected.width,
          height: inspected.height,
          animated: inspected.animated,
          createdAt: timestamp,
          updatedAt: timestamp,
          usedAt: null,
          usageCount: 0,
        };

        await db.items.add(row);
        await db.blobs.add({ itemId: row.id, original: inspected.file, variants: {} });

        return toItem(row);
      });
    },

    /**
     * Adds an item from an archive, keeping the id, dates and usage it had when it can.
     *
     * @param input - The file and its details.
     * @param skipDuplicates - Leave out a file whose content is already in the library.
     * @returns The new item, or null when it was skipped as a duplicate.
     */
    async import(input: TImportItem, skipDuplicates: boolean): Promise<TItem | null> {
      checkType(input.type);

      const title = checkTitle(input.title);
      const inspected = await inspectFile(input.file);
      const timestamp = now();

      return db.transaction("rw", db.items, db.blobs, db.tags, async () => {
        if (skipDuplicates && await db.items.where("hash").equals(inspected.hash).count()) {
          return null;
        }

        // An id that is already taken belongs to a different item, so this one gets a fresh id.
        const id = input.id && !await db.items.get(input.id) ? input.id : crypto.randomUUID();
        const createdAt = input.createdAt ?? timestamp;
        const row: TItemRow = {
          id,
          type: input.type,
          title,
          description: input.description?.trim() ?? "",
          tags: await checkTags(input.tags ?? []),
          favorite: input.favorite ? 1 : 0,
          hash: inspected.hash,
          size: inspected.size,
          format: inspected.format,
          mime: inspected.mime,
          width: inspected.width,
          height: inspected.height,
          animated: inspected.animated,
          createdAt,
          updatedAt: input.updatedAt ?? createdAt,
          usedAt: input.usedAt ?? null,
          usageCount: input.usageCount ?? 0,
        };

        await db.items.add(row);
        await db.blobs.add({ itemId: id, original: inspected.file, variants: {} });

        return toItem(row);
      });
    },

    /**
     * Deletes every item and file.
     *
     * @returns The ids of the items that were deleted.
     */
    async clear(): Promise<string[]> {
      return db.transaction("rw", db.items, db.blobs, async () => {
        const ids = await db.items.toCollection().primaryKeys();

        await db.items.clear();
        await db.blobs.clear();

        return ids;
      });
    },

    /**
     * Edits an item. Replacing its file drops the cached sized copies.
     *
     * @param id - The item's id.
     * @param patch - The fields to change.
     * @returns The updated item.
     */
    async update(id: string, patch: TItemPatch): Promise<TItem> {
      if (patch.type !== undefined) {
        checkType(patch.type);
      }

      const title = patch.title === undefined ? undefined : checkTitle(patch.title);
      const inspected = patch.file ? await inspectFile(patch.file) : null;

      return db.transaction("rw", db.items, db.blobs, db.tags, async () => {
        const current = await getRow(id);
        const row: TItemRow = {
          ...current,
          ...(patch.type !== undefined && { type: patch.type }),
          ...(title !== undefined && { title }),
          ...(patch.description !== undefined && { description: patch.description.trim() }),
          ...(patch.tags !== undefined && { tags: await checkTags(patch.tags) }),
          ...(patch.favorite !== undefined && { favorite: patch.favorite ? 1 : 0 }),
          ...(inspected && {
            hash: inspected.hash,
            size: inspected.size,
            format: inspected.format,
            mime: inspected.mime,
            width: inspected.width,
            height: inspected.height,
            animated: inspected.animated,
          }),
          updatedAt: now(),
        };

        await db.items.put(row);

        if (inspected) {
          await db.blobs.put({ itemId: id, original: inspected.file, variants: {} });
        }

        return toItem(row);
      });
    },

    /**
     * Deletes an item and its files.
     *
     * @param id - The item's id.
     * @returns Whether the item existed.
     */
    async remove(id: string): Promise<boolean> {
      return db.transaction("rw", db.items, db.blobs, async () => {
        const existed = (await db.items.get(id)) !== undefined;

        await db.items.delete(id);
        await db.blobs.delete(id);

        return existed;
      });
    },

    /**
     * Records that an item was sent, for the Recent section.
     *
     * @param id - The item's id.
     * @returns The updated item.
     */
    async use(id: string): Promise<TItem> {
      return db.transaction("rw", db.items, async () => {
        const current = await getRow(id);
        const row: TItemRow = { ...current, usedAt: now(), usageCount: current.usageCount + 1 };

        await db.items.put(row);

        return toItem(row);
      });
    },

    /**
     * Reads an item's original file.
     *
     * @param id - The item's id.
     * @returns The file, or null.
     */
    async file(id: string): Promise<Blob | null> {
      const row = await db.blobs.get(id);

      return row?.original ?? null;
    },

    /**
     * Reads a cached sized copy of an item's file.
     *
     * @param id - The item's id.
     * @param key - The copy's name, e.g. "emoji-48".
     * @returns The copy, or null when it has not been made yet.
     */
    async variant(id: string, key: string): Promise<Blob | null> {
      const row = await db.blobs.get(id);

      return row?.variants[key] ?? null;
    },

    /**
     * Caches a sized copy of an item's file.
     *
     * @param id - The item's id.
     * @param key - The copy's name, e.g. "emoji-48".
     * @param file - The sized file.
     * @returns Resolves once stored; rejects when the item does not exist.
     */
    async storeVariant(id: string, key: string, file: Blob): Promise<void> {
      const updated = await db.blobs.where("itemId").equals(id).modify((row) => {
        row.variants = { ...row.variants, [key]: file };
      });

      if (!updated) {
        throw new Error(`No item "${id}"`);
      }
    },
  };
}
