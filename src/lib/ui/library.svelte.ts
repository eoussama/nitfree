import type { TItem, TTag } from "~/lib/db";

import { toError, tryCatch } from "@eoussama/core";

import { onEvent, sendMessage } from "~/lib/messaging";

import { forgetThumbnails } from "./thumbnails";



type TLibraryState = {
  items: TItem[];
  tags: TTag[];
  loaded: boolean;
  error: string | null;
};

/**
 * The library as the Discord tab sees it, kept in step with the background worker.
 */
export const library: TLibraryState = $state({ items: [], tags: [], loaded: false, error: null });

async function load(): Promise<void> {
  const [error, result] = await tryCatch(Promise.all([sendMessage("library:list"), sendMessage("tags:list")]));

  if (error) {
    library.error = toError(error).message;

    return;
  }

  const [items, tags] = result;

  library.items = items;
  library.tags = tags;
  library.loaded = true;
  library.error = null;
  forgetThumbnails(items);
}

/**
 * Loads the library and reloads it whenever the background announces a change,
 * from this tab, another tab or the popup.
 *
 * @returns A function that stops following and frees the thumbnails.
 */
export function followLibrary(): () => void {
  void load();

  const stops = [onEvent("library:changed", () => void load()), onEvent("tags:changed", () => void load())];

  return () => {
    stops.forEach(stop => stop());
    forgetThumbnails([]);
  };
}
