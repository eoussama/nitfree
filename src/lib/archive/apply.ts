import type { TParsedArchive } from "./read";

import type { TImportItem, TItem, TNewPack, TNewTag, TPack, TTag } from "~/lib/db";



export type TImportMode = "merge" | "replace";

/**
 * Where an archive is written to. In the extension these are messages to the background worker.
 */
export type TImportTarget = {
  clear: () => Promise<void>;
  ensureTag: (tag: TNewTag) => Promise<Pick<TTag, "id">>;
  ensurePack: (pack: TNewPack) => Promise<Pick<TPack, "id">>;

  /**
   * Adds one item; resolves to null when it was skipped as a duplicate.
   */
  importItem: (item: TImportItem, skipDuplicates: boolean) => Promise<TItem | null>;
};

export type TImportCounts = {
  added: number;
  skipped: number;
  failed: number;
};

/**
 * Writes a checked archive to the library. Merging adds what the library does not have yet,
 * skipping files whose content it already holds, so importing the same archive twice adds
 * nothing the second time. Replacing empties the library first and keeps every item.
 * One item failing does not stop the others.
 *
 * @param archive - The archive, already read and validated.
 * @param mode - Merge into the library or replace it.
 * @param target - Where to write.
 * @param onProgress - Called after each item.
 * @returns How many items were added, skipped and failed.
 */
export async function applyArchive(
  archive: TParsedArchive,
  mode: TImportMode,
  target: TImportTarget,
  onProgress?: (done: number, total: number) => void,
): Promise<TImportCounts> {
  if (mode === "replace") {
    await target.clear();
  }

  const tagIds: Record<string, string> = Object.create(null) as Record<string, string>;
  const packIds: Record<string, string> = Object.create(null) as Record<string, string>;

  for (const tag of archive.tags) {
    tagIds[tag.name] = (await target.ensureTag({ name: tag.name, color: tag.color })).id;
  }

  // A pack already in the library takes the imported items, rather than a copy of it being made.
  for (const pack of archive.packs) {
    packIds[pack.name] = (await target.ensurePack({ name: pack.name })).id;
  }

  const counts: TImportCounts = { added: 0, skipped: 0, failed: 0 };

  for (const [index, entry] of archive.entries.entries()) {
    try {
      const item = await target.importItem({
        id: entry.id ?? undefined,
        file: new Blob([entry.bytes]),
        type: entry.type,
        title: entry.title,
        description: entry.description,
        tags: entry.tags.map(name => tagIds[name]).filter((id): id is string => id !== undefined),
        packs: entry.packs.map(name => packIds[name]).filter((id): id is string => id !== undefined),
        favorite: entry.favorite,
        createdAt: entry.createdAt ?? undefined,
        updatedAt: entry.updatedAt ?? undefined,
        usedAt: entry.usedAt,
        usageCount: entry.usageCount,
      }, mode === "merge");

      counts[item ? "added" : "skipped"]++;
    }
    catch {
      counts.failed++;
    }

    onProgress?.(index + 1, archive.entries.length);
  }

  return counts;
}
