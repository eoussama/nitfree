import type { TArchiveItem, TArchiveLibrary, TArchiveSettings, TManifest } from "./schema";

import type { TItem, TPack, TTag } from "~/lib/db";

import { strToU8, zipSync } from "fflate";

import { ArchiveError } from "./errors";
import { ARCHIVE_VERSION } from "./schema";



export type TArchiveSource = {
  items: readonly TItem[];
  tags: readonly TTag[];

  /**
   * The packs to include. An item keeps only the packs listed here, so a part of the library exports
   * with the packs it needs and nothing else.
   */
  packs?: readonly TPack[];
  settings?: TArchiveSettings;
  appVersion: string;

  /**
   * Reads an item's original file.
   */
  readFile: (item: TItem) => Promise<Uint8Array | null>;

  /**
   * Called after each file is read, so large libraries can show progress.
   */
  onProgress?: (done: number, total: number) => void;
  now?: () => number;
};

const EXTENSIONS: Record<TItem["format"], string> = { png: "png", gif: "gif", webp: "webp", jpeg: "jpg" };

/**
 * Where an item's original file sits inside an archive.
 *
 * @param item - The item.
 * @returns The path, e.g. "files/3f2a.png".
 */
export function archivePath(item: Pick<TItem, "id" | "format">): string {
  return `files/${item.id}.${EXTENSIONS[item.format]}`;
}

/**
 * Keeps the tags that at least one of the items carries.
 *
 * @param items - The items.
 * @param tags - Every tag.
 * @returns The tags in use.
 */
export function tagsOf(items: readonly TItem[], tags: readonly TTag[]): TTag[] {
  const used = new Set(items.flatMap(item => item.tags));

  return tags.filter(tag => used.has(tag.id));
}

/**
 * Keeps the packs that at least one of the items is in.
 *
 * @param items - The items.
 * @param packs - Every pack.
 * @returns The packs in use.
 */
export function packsOf(items: readonly TItem[], packs: readonly TPack[]): TPack[] {
  const used = new Set(items.flatMap(item => item.packs));

  return packs.filter(pack => used.has(pack.id));
}

function json(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

/**
 * Packs items, their tags, packs and original files into a `.nitfree` archive: a zip holding
 * `manifest.json`, `library.json`, the files under `files/`, and optionally `settings.json`.
 *
 * @param source - What to pack and how to read the files.
 * @returns The archive's bytes.
 */
export async function writeArchive(source: TArchiveSource): Promise<Uint8Array> {
  const { items, tags, packs = [], settings, appVersion, readFile, onProgress, now = Date.now } = source;
  // Images are already compressed, so the files are stored as they are and only the JSON is deflated.
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  const archived: TArchiveItem[] = [];
  const packIds = new Set(packs.map(pack => pack.id));

  for (const [index, item] of items.entries()) {
    const bytes = await readFile(item);

    if (!bytes) {
      throw new ArchiveError("notInLibrary", `The file of "${item.title}" is missing from the library`, { title: item.title });
    }

    const file = archivePath(item);

    entries[file] = [bytes, { level: 0 }];
    archived.push({ ...item, packs: item.packs.filter(id => packIds.has(id)), file });
    onProgress?.(index + 1, items.length);
  }

  const manifest: TManifest = { format: "nitfree", version: ARCHIVE_VERSION, appVersion, exportedAt: now() };
  const library: TArchiveLibrary = {
    items: archived,
    tags: tags.map(({ id, name, color, createdAt }) => ({ id, name, color, createdAt })),
    // An icon is kept only when its item is in the archive and in the pack.
    packs: packs.map(({ id, name, icon, createdAt }) => ({
      id,
      name,
      icon: archived.some(item => item.id === icon && item.packs.includes(id)) ? icon : null,
      createdAt,
    })),
  };

  // Stryker disable ObjectLiteral: 6 is the level fflate deflates at anyway.
  entries["manifest.json"] = [json(manifest), { level: 6 }];
  entries["library.json"] = [json(library), { level: 6 }];

  if (settings) {
    entries["settings.json"] = [json(settings), { level: 6 }];
    // Stryker restore ObjectLiteral
  }

  return zipSync(entries);
}
