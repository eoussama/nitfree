import type { NitfreeDatabase } from "./schema";
import type { TNewPack, TPack, TPackPatch, TPackRow } from "./types";

import { tagKey } from "./tags";



export type TPacks = ReturnType<typeof createPacks>;

function toPack({ key: _, ...row }: TPackRow): TPack {
  return row;
}

function checkName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    throw new Error("A pack needs a name");
  }

  return trimmed;
}

/**
 * The pack service. Runs in the background worker; other contexts reach it through messaging.
 *
 * @param db - The library database.
 * @param now - Clock, replaceable in tests.
 * @returns The service.
 */
export function createPacks(db: NitfreeDatabase, now: () => number = Date.now) {
  async function checkFree(key: string, except?: string): Promise<void> {
    const existing = await db.packs.where("key").equals(key).first();

    if (existing && existing.id !== except) {
      throw new Error(`A pack named "${existing.name}" already exists`);
    }
  }

  return {
    /**
     * Lists every pack, by name.
     *
     * @returns The packs.
     */
    async list(): Promise<TPack[]> {
      const rows = await db.packs.orderBy("key").toArray();

      return rows.map(toPack);
    },

    /**
     * Creates a pack.
     *
     * @param input - The pack's name.
     * @returns The new pack.
     */
    async add(input: TNewPack): Promise<TPack> {
      const name = checkName(input.name);
      const key = tagKey(name);

      return db.transaction("rw", db.packs, async () => {
        await checkFree(key);

        const row: TPackRow = { id: crypto.randomUUID(), name, key, createdAt: now() };

        await db.packs.add(row);

        return toPack(row);
      });
    },

    /**
     * Finds the pack with this name, whatever its case, or creates it. Used when importing, so a pack
     * that is already there takes the imported items rather than being duplicated.
     *
     * @param input - The pack's name.
     * @returns The pack, and whether it was just created.
     */
    async ensure(input: TNewPack): Promise<{ pack: TPack; created: boolean }> {
      const name = checkName(input.name);
      const key = tagKey(name);

      return db.transaction("rw", db.packs, async () => {
        const existing = await db.packs.where("key").equals(key).first();

        if (existing) {
          return { pack: toPack(existing), created: false };
        }

        const row: TPackRow = { id: crypto.randomUUID(), name, key, createdAt: now() };

        await db.packs.add(row);

        return { pack: toPack(row), created: true };
      });
    },

    /**
     * Renames a pack.
     *
     * @param id - The pack's id.
     * @param patch - The fields to change.
     * @returns The updated pack.
     */
    async update(id: string, patch: TPackPatch): Promise<TPack> {
      const name = patch.name === undefined ? undefined : checkName(patch.name);

      return db.transaction("rw", db.packs, async () => {
        const current = await db.packs.get(id);

        if (!current) {
          throw new Error(`No pack "${id}"`);
        }

        const row: TPackRow = {
          ...current,
          ...(name !== undefined && { name, key: tagKey(name) }),
        };

        await checkFree(row.key, id);
        await db.packs.put(row);

        return toPack(row);
      });
    },

    /**
     * Deletes a pack and takes it off every item in it. The items themselves are kept.
     *
     * @param id - The pack's id.
     * @returns The ids of the items that were in the pack.
     */
    async remove(id: string): Promise<string[]> {
      return db.transaction("rw", db.packs, db.items, async () => {
        const items = await db.items.where("packs").equals(id).primaryKeys();
        const timestamp = now();

        await db.items.where("packs").equals(id).modify((row) => {
          row.packs = row.packs.filter(pack => pack !== id);
          row.updatedAt = timestamp;
        });
        await db.packs.delete(id);

        return items;
      });
    },

    /**
     * Deletes every pack. Items are not touched, so clear them first.
     *
     * @returns The ids of the packs that were deleted.
     */
    async clear(): Promise<string[]> {
      return db.transaction("rw", db.packs, async () => {
        const ids = await db.packs.toCollection().primaryKeys();

        await db.packs.clear();

        return ids;
      });
    },
  };
}
