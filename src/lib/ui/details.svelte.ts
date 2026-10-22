import type { TItem } from "~/lib/db";

import { focusedElement, startEdit } from "./editor.svelte";
import { library } from "./library.svelte";



type TDetailsState = {
  // The item shown, by id, so the dialog follows its changes, such as a favorite toggled elsewhere.
  id: string | null;
};

/**
 * The details dialog: everything about an item, read only, with Favorite, Download and Edit. It
 * lives in the page overlay.
 */
export const details: TDetailsState = $state({ id: null });

// What had focus before the dialog opened, focused again when it closes.
let returnFocus: HTMLElement | null = null;

/**
 * The item the details dialog shows, as the library has it now.
 *
 * @returns The item, or null when the dialog is closed or the item is gone.
 */
export function detailsItem(): TItem | null {
  return details.id ? library.items.find(item => item.id === details.id) ?? null : null;
}

/**
 * Opens the details of an item.
 *
 * @param item - The item.
 * @param focus - What to focus when the dialog closes; by default, what has focus now.
 */
export function openDetails(item: TItem, focus: HTMLElement | null = focusedElement()): void {
  returnFocus = focus;
  details.id = item.id;
}

/**
 * Closes the details dialog.
 *
 * @param refocus - Whether to give focus back to where it was.
 */
export function closeDetails(refocus = true): void {
  const focus = returnFocus;

  details.id = null;
  returnFocus = null;

  if (refocus && focus?.isConnected) {
    focus.focus();
  }
}

/**
 * Swaps the details dialog for the edit dialog of the same item; closing that one gives focus back to
 * where it was before the details opened.
 */
export function editFromDetails(): void {
  const item = detailsItem();
  const focus = returnFocus;

  closeDetails(false);

  if (item) {
    startEdit(item, focus);
  }
}
