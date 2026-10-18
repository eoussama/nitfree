import type { TItem } from "~/lib/db";

import { sendMessage } from "~/lib/messaging";



/**
 * How long a deleted item can still be brought back.
 */
export const UNDO_DELAY = 6000;

type TPending = {
  item: TItem;
  timer: ReturnType<typeof setTimeout> | null;
  // Sent to the background: no longer undoable, and hidden until the library no longer lists it.
  committing: boolean;
};

type TTrashState = {
  pending: TPending[];
};

/**
 * Items deleted in this tab. They are hidden from the panel at once, removed from the library once
 * the undo delay has passed, and stay hidden until the reloaded library no longer has them.
 */
export const trash: TTrashState = $state({ pending: [] });

function commit(id: string): void {
  const entry = trash.pending.find(pending => pending.item.id === id && !pending.committing);

  if (!entry) {
    return;
  }

  clearTimeout(entry.timer ?? undefined);
  entry.timer = null;
  entry.committing = true;

  // If the background could not remove it, it shows again.
  void sendMessage("library:remove", { id }).catch(() => {
    trash.pending = trash.pending.filter(pending => pending.item.id !== id);
  });
}

/**
 * Deletes an item, with a few seconds to undo.
 *
 * @param item - The item to delete.
 */
export function deleteWithUndo(item: TItem): void {
  if (trash.pending.some(pending => pending.item.id === item.id)) {
    return;
  }

  trash.pending = [...trash.pending, { item, timer: setTimeout(commit, UNDO_DELAY, item.id), committing: false }];
}

/**
 * Brings back a deleted item before its deletion is final.
 *
 * @param id - The item's id.
 */
export function undoDelete(id: string): void {
  const entry = trash.pending.find(pending => pending.item.id === id && !pending.committing);

  if (entry) {
    clearTimeout(entry.timer ?? undefined);
    trash.pending = trash.pending.filter(pending => pending !== entry);
  }
}

/**
 * The latest deletion that can still be undone.
 *
 * @returns The deleted item, or null.
 */
export function undoable(): TItem | null {
  return trash.pending.findLast(pending => !pending.committing)?.item ?? null;
}

/**
 * Forgets removed items once the library no longer lists them.
 *
 * @param items - The library, as just loaded.
 */
export function pruneTrash(items: readonly TItem[]): void {
  const listed = (pending: TPending): boolean => items.some(item => item.id === pending.item.id);

  if (trash.pending.some(pending => pending.committing && !listed(pending))) {
    trash.pending = trash.pending.filter(pending => !pending.committing || listed(pending));
  }
}

/**
 * Makes every pending deletion final now, e.g. when the page goes away.
 */
export function flushTrash(): void {
  for (const { item } of [...trash.pending]) {
    commit(item.id);
  }
}
