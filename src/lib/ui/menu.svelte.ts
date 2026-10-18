import type { TItem } from "~/lib/db";



type TMenuState = {
  item: TItem | null;
  x: number;
  y: number;
  restoreFocus: HTMLElement | null;
};

/**
 * The right-click menu on a library item. It lives in the page overlay.
 */
export const menu: TMenuState = $state({ item: null, x: 0, y: 0, restoreFocus: null });

/**
 * Opens the menu for an item.
 *
 * @param item - The item.
 * @param x - Where to open it, in viewport pixels.
 * @param y - Where to open it, in viewport pixels.
 * @param restoreFocus - What to focus again when it closes, for keyboard users.
 */
export function openMenu(item: TItem, x: number, y: number, restoreFocus: HTMLElement | null = null): void {
  menu.item = item;
  menu.x = x;
  menu.y = y;
  menu.restoreFocus = restoreFocus;
}

/**
 * Closes the menu.
 *
 * @param refocus - Whether to give focus back to where it was.
 */
export function closeMenu(refocus = false): void {
  const target = menu.restoreFocus;

  menu.item = null;
  menu.restoreFocus = null;

  if (refocus) {
    target?.focus();
  }
}
