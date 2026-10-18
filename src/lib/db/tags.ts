import type { NitfreeDatabase } from "./schema";
import type { TNewTag, TTag, TTagPatch, TTagRow } from "./types";



export type TTags = ReturnType<typeof createTags>;

/**
 * Normalizes a tag name into the key that keeps names unique regardless of case and spacing.
 *
 * @param name - The tag name.
 * @returns The key.
 */
export function tagKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function toTag({ key: _, ...row }: TTagRow): TTag {
  return row;
}

function checkName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    throw new Error("A tag needs a name");
  }

  return trimmed;
}

/**
 * The tag service. Runs in the background worker; other contexts reach it through messaging.
 *
 * @param db - The library database.
 * @param now - Clock, replaceable in tests.
 * @returns The service.
 */
export function createTags(db: NitfreeDatabase, now: () => number = Date.now) {
  async function checkFree(key: string, except?: string): Promise<void> {
    const existing = await db.tags.where("key").equals(key).first();

    if (existing && existing.id !== except) {
      throw new Error(`A tag named "${existing.name}" already exists`);
    }
  }

  return {
    /**
     * Lists every tag, by name.
     *
     * @returns The tags.
     */
    async list(): Promise<TTag[]> {
      const rows = await db.tags.orderBy("key").toArray();

      return rows.map(toTag);
    },

    /**
     * Creates a tag.
     *
     * @param input - The tag's name and color.
     * @returns The new tag.
     */
    async add(input: TNewTag): Promise<TTag> {
      const name = checkName(input.name);
      const key = tagKey(name);

      return db.transaction("rw", db.tags, async () => {
        await checkFree(key);

        const row: TTagRow = { id: crypto.randomUUID(), name, key, color: input.color ?? null, createdAt: now() };

        await db.tags.add(row);

        return toTag(row);
      });
    },

    /**
     * Renames or recolors a tag.
     *
     * @param id - The tag's id.
     * @param patch - The fields to change.
     * @returns The updated tag.
     */
    async update(id: string, patch: TTagPatch): Promise<TTag> {
      const name = patch.name === undefined ? undefined : checkName(patch.name);

      return db.transaction("rw", db.tags, async () => {
        const current = await db.tags.get(id);

        if (!current) {
          throw new Error(`No tag "${id}"`);
        }

        const row: TTagRow = {
          ...current,
          ...(name !== undefined && { name, key: tagKey(name) }),
          ...(patch.color !== undefined && { color: patch.color }),
        };

        await checkFree(row.key, id);
        await db.tags.put(row);

        return toTag(row);
      });
    },

    /**
     * Deletes a tag and takes it off every item that carries it.
     *
     * @param id - The tag's id.
     * @returns The ids of the items that lost the tag.
     */
    async remove(id: string): Promise<string[]> {
      return db.transaction("rw", db.tags, db.items, async () => {
        const items = await db.items.where("tags").equals(id).primaryKeys();
        const timestamp = now();

        await db.items.where("tags").equals(id).modify((row) => {
          row.tags = row.tags.filter(tag => tag !== id);
          row.updatedAt = timestamp;
        });
        await db.tags.delete(id);

        return items;
      });
    },
  };
}
