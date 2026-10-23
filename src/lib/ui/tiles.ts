/**
 * The tile to focus when one goes away: the next one showing a different item, else the previous.
 * The same item can show in several sections (Favorites, Recent, All files), and goes from all of them.
 *
 * @param tile - The tile going away.
 * @returns Its neighbor, or null when it was the only item.
 */
export function neighborTile(tile: HTMLElement): HTMLElement | null {
  const root = tile.getRootNode() as Document | ShadowRoot;
  const id = tile.dataset.tile;
  const all = [...root.querySelectorAll<HTMLElement>("[data-tile]")];
  const index = all.indexOf(tile);
  const others = (list: HTMLElement[]): HTMLElement | undefined => list.find(other => other.dataset.tile !== id);

  return others(all.slice(index + 1)) ?? others(all.slice(0, Math.max(index, 0)).reverse()) ?? null;
}

/**
 * Moves focus off a tile that is going away: to its neighbor, or to the panel's search when it was the
 * last item, so focus never falls back to Discord's page.
 *
 * @param tile - The tile going away.
 */
export function focusAfterRemoval(tile: HTMLElement): void {
  const root = tile.getRootNode() as Document | ShadowRoot;

  (neighborTile(tile) ?? root.querySelector<HTMLElement>("input[type=\"search\"]"))?.focus();
}

/**
 * Where focus goes when an item leaves Favorites: its tile in All files, the last section, which
 * lists every item. Elsewhere, the tile itself stays.
 *
 * @param tile - The focused tile.
 * @returns The tile to focus.
 */
export function tileAfterUnfavorite(tile: HTMLElement): HTMLElement {
  const root = tile.getRootNode() as Document | ShadowRoot;
  const inFavorites = Boolean(tile.closest("section")?.querySelector("[data-section=\"favorites\"]"));

  // The tile itself is one of the item's tiles, so there is always a last one.
  return inFavorites ? [...root.querySelectorAll<HTMLElement>(`[data-tile="${tile.dataset.tile}"]`)].at(-1)! : tile;
}
