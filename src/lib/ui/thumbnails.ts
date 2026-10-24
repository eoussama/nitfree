import type { TItem } from "~/lib/db";

import { stillImage } from "~/lib/media/resize";
import { sendMessage } from "~/lib/messaging";



/**
 * The longest side of the stills shown in the grid: twice a tile's 40 px image, for sharp screens.
 */
export const STILL_SIZE = 96;


/**
 * How many stills are made at once, so opening a large library for the first time stays smooth.
 */
const STILL_WORKERS = 3;

type TEntry = { hash: string; url: Promise<string | null> };

/**
 * Object URLs by item id, with the hash they were made from: originals, for animating and sending
 * previews, and stills, for the grid.
 */
const originals = new Map<string, TEntry>();
const stills = new Map<string, TEntry>();

function cached(map: Map<string, TEntry>, item: TItem, load: () => Promise<Blob | null>): Promise<string | null> {
  const found = map.get(item.id);

  if (found?.hash === item.hash) {
    return found.url;
  }

  const entry: TEntry = { hash: item.hash, url: Promise.resolve(null) };

  entry.url = load()
    .then(file => (file ? URL.createObjectURL(file) : null))
    .catch(() => {
      // Not cached, so the next time the tile shows it tries again, e.g. once the background is back.
      if (map.get(item.id) === entry) {
        map.delete(item.id);
      }

      return null;
    });

  map.set(item.id, entry);

  return entry.url;
}

let running = 0;
const waiting: Array<() => void> = [];

async function inTurn<T>(task: () => Promise<T>): Promise<T> {
  // A finished task hands its slot straight to the next waiting one, so none can slip in between.
  if (running >= STILL_WORKERS) {
    await new Promise<void>(resolve => waiting.push(resolve));
  }
  else {
    running++;
  }

  try {
    return await task();
  }
  finally {
    const next = waiting.shift();

    if (next) {
      next();
    }
    else {
      running--;
    }
  }
}

/**
 * An object URL for an item's original file, fetched from the background once and reused until the
 * file changes. Animated items play from it.
 *
 * @param item - The item.
 * @returns The URL, or null when the file is missing.
 */
export function thumbnail(item: TItem): Promise<string | null> {
  return cached(originals, item, () => sendMessage("library:file", { id: item.id }));
}

/**
 * An object URL for a small still of an item, for the grid: made once from the original, its first
 * frame when animated, and kept in the library. Small still images use the original.
 *
 * @param item - The item.
 * @returns The URL, or null when the file is missing.
 */
export function still(item: TItem): Promise<string | null> {
  if (!item.animated && Math.max(item.width, item.height) <= STILL_SIZE) {
    return thumbnail(item);
  }

  // Named after the file, so a still finished after the file was replaced is never shown for the new one.
  const key = `still-${STILL_SIZE}-${item.hash}`;

  return cached(stills, item, async () => {
    const stored = await sendMessage("library:variant", { id: item.id, key });

    if (stored) {
      return stored;
    }

    const original = await sendMessage("library:file", { id: item.id });

    if (!original) {
      return null;
    }

    const made = await inTurn(() => stillImage(original, item, STILL_SIZE));

    void sendMessage("library:storeVariant", { id: item.id, key, file: made }).catch(() => undefined);

    return made;
  });
}

/**
 * Frees the URLs of items that are gone or whose file changed.
 *
 * @param items - The items still in the library.
 */
export function forgetThumbnails(items: readonly TItem[]): void {
  const current = new Map(items.map(item => [item.id, item.hash]));

  for (const map of [originals, stills]) {
    for (const [id, entry] of map) {
      if (current.get(id) !== entry.hash) {
        void entry.url.then(url => url && URL.revokeObjectURL(url));
        map.delete(id);
      }
    }
  }
}

/**
 * How many tiles start loading at a time, when the page has a moment to spare. Tiles that scroll out
 * of view before their turn wait until they show again, so a fast scroll through a large library
 * only loads where it stops.
 */
const LOAD_BATCH = 8;
const LOAD_DEADLINE = 150;

const watchers = new Map<Element, () => void>();
const due = new Set<Element>();
let observer: IntersectionObserver | null = null;
let scheduled = false;

// Stryker disable all: an element no longer observed or due is never looked up again, and the observer
// is made before anything is watched.
function stop(target: Element): void {
  watchers.delete(target);
  due.delete(target);
  observer?.unobserve(target);
}
// Stryker restore all

function load(): void {
  scheduled = false;

  for (const target of [...due].slice(0, LOAD_BATCH)) {
    const callback = watchers.get(target);

    stop(target);
    // Stryker disable next-line OptionalChaining: only watched elements are due.
    callback?.();
  }

  schedule();
}

function schedule(): void {
  if (scheduled || !due.size) {
    return;
  }

  scheduled = true;

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(load, { timeout: LOAD_DEADLINE });
  }
  else {
    setTimeout(load, 16);
  }
}

/**
 * Calls back once an element is in view, through one observer for every tile, a few at a time.
 *
 * @param element - The element.
 * @param callback - What to do once it shows.
 * @returns A function that stops watching.
 */
export function whenVisible(element: Element, callback: () => void): () => void {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        due.add(entry.target);
      }
      else {
        due.delete(entry.target);
      }
    }

    schedule();
  });

  watchers.set(element, callback);
  observer.observe(element);

  return () => stop(element);
}
