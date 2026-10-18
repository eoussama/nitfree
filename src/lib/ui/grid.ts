export type TRect = { x: number; y: number; width: number; height: number };

export type TGridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

export const GRID_KEYS: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

function centerX(rect: TRect): number {
  return rect.x + rect.width / 2;
}

function centerY(rect: TRect): number {
  return rect.y + rect.height / 2;
}

/**
 * Finds the tile in the next row up or down, the one closest horizontally.
 *
 * @param rects - Every tile's box, in reading order.
 * @param from - The focused tile.
 * @param direction - 1 for down, -1 for up.
 * @returns The tile to move to, or `from` when there is no row that way.
 */
function verticalNeighbor(rects: readonly TRect[], from: number, direction: 1 | -1): number {
  const current = rects[from]!;
  const candidates = rects
    .map((rect, index) => ({ rect, index }))
    .filter(({ rect }) => (centerY(rect) - centerY(current)) * direction > current.height / 2);

  if (!candidates.length) {
    return from;
  }

  const rowY = direction === 1
    ? Math.min(...candidates.map(({ rect }) => rect.y))
    : Math.max(...candidates.map(({ rect }) => rect.y));
  const row = candidates.filter(({ rect }) => Math.abs(rect.y - rowY) < current.height / 2);

  return row.reduce((best, candidate) =>
    Math.abs(centerX(candidate.rect) - centerX(current)) < Math.abs(centerX(best.rect) - centerX(current)) ? candidate : best,
  ).index;
}

/**
 * Moves focus through tiles laid out in rows, across sections, from their positions on screen,
 * so it works whatever the column count.
 *
 * @param rects - Every tile's box, in reading order.
 * @param from - The focused tile.
 * @param key - The key pressed.
 * @returns The tile to focus next.
 */
export function nextTile(rects: readonly TRect[], from: number, key: TGridKey): number {
  const last = rects.length - 1;

  switch (key) {
    case "ArrowLeft":
      return Math.max(0, from - 1);

    case "ArrowRight":
      return Math.min(last, from + 1);

    case "Home":
      return 0;

    case "End":
      return last;

    case "ArrowDown":
      return verticalNeighbor(rects, from, 1);

    case "ArrowUp":
      return verticalNeighbor(rects, from, -1);
  }
}
