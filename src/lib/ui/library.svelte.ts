import type { TItem, TTag } from "~/lib/db";

import { toError, tryCatch } from "@eoussama/core";

import { onEvent, sendMessage } from "~/lib/messaging";

import { forgetThumbnails } from "./thumbnails";
import { pruneTrash } from "./trash.svelte";



type TLibraryState = {
  items: TItem[];
  tags: TTag[];
  loaded: boolean;
  error: string | null;
};

/**
 * Retry delays after a failed load, for when the background worker is restarting.
 */
const RETRY_DELAYS = [500, 1000, 2000, 4000, 8000];

/**
 * How long to wait after a change is announced for more to come, so a burst, such as many files
 * added at once, makes one reload rather than one each.
 */
const SETTLE_DELAY = 50;

/**
 * The library as the Discord tab sees it, kept in step with the background worker.
 * `error` is only set while nothing has ever loaded; a failed reload keeps showing the last library.
 */
export const library: TLibraryState = $state({ items: [], tags: [], loaded: false, error: null });

/**
 * Loads the library and reloads it whenever the background announces a change,
 * from this tab, another tab or the popup.
 *
 * @returns A function that stops following and frees the thumbnails.
 */
export function followLibrary(): () => void {
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  // One load at a time: changes announced meanwhile, such as a burst of adds, make one more load after it.
  let loading = false;
  let again = false;

  async function load(): Promise<void> {
    clearTimeout(retry);

    if (loading) {
      again = true;

      return;
    }

    loading = true;

    const [error, result] = await tryCatch(Promise.all([sendMessage("library:list"), sendMessage("tags:list")]));

    loading = false;

    if (stopped) {
      return;
    }

    if (again) {
      again = false;
      void load();

      if (error) {
        return;
      }
    }

    if (error) {
      if (!library.loaded) {
        library.error = toError(error).message;
      }

      const delay = RETRY_DELAYS[attempt++];

      if (delay !== undefined) {
        retry = setTimeout(() => void load(), delay);
      }

      return;
    }

    const [items, tags] = result;

    attempt = 0;
    library.items = items;
    library.tags = tags;
    library.loaded = true;
    library.error = null;
    forgetThumbnails(items);
    pruneTrash(items);
  }

  function reload(): void {
    clearTimeout(settle);
    settle = setTimeout(() => void load(), SETTLE_DELAY);
  }

  void load();

  const stops = [onEvent("library:changed", reload), onEvent("tags:changed", reload)];

  return () => {
    stopped = true;
    clearTimeout(retry);
    clearTimeout(settle);
    stops.forEach(stop => stop());
    forgetThumbnails([]);
  };
}
