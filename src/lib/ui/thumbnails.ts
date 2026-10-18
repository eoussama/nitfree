import type { TItem } from "~/lib/db";

import { sendMessage } from "~/lib/messaging";



/**
 * Object URLs for items' files, by item id, with the hash they were made from.
 */
const thumbnails = new Map<string, { hash: string; url: Promise<string | null> }>();

/**
 * An object URL for an item's original file, fetched from the background once and reused
 * until the file changes.
 *
 * @param item - The item.
 * @returns The URL, or null when the file is missing.
 */
export function thumbnail(item: TItem): Promise<string | null> {
  const cached = thumbnails.get(item.id);

  if (cached?.hash === item.hash) {
    return cached.url;
  }

  const entry = { hash: item.hash, url: Promise.resolve<string | null>(null) };

  entry.url = sendMessage("library:file", { id: item.id })
    .then(file => (file ? URL.createObjectURL(file) : null))
    .catch(() => {
      // Not cached, so the next time the tile shows it tries again, e.g. once the background is back.
      if (thumbnails.get(item.id) === entry) {
        thumbnails.delete(item.id);
      }

      return null;
    });

  thumbnails.set(item.id, entry);

  return entry.url;
}

/**
 * Frees the URLs of items that are gone or whose file changed.
 *
 * @param items - The items still in the library.
 */
export function forgetThumbnails(items: readonly TItem[]): void {
  const current = new Map(items.map(item => [item.id, item.hash]));

  for (const [id, entry] of thumbnails) {
    if (current.get(id) !== entry.hash) {
      void entry.url.then(url => url && URL.revokeObjectURL(url));
      thumbnails.delete(id);
    }
  }
}
