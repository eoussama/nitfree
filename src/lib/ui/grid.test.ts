import type { TRect } from "./grid";

import { describe, expect, it } from "vitest";

import { nextTile } from "./grid";



/**
 * Lays tiles out like the panel: sections of rows, `columns` tiles wide, with a gap for each section heading.
 *
 * @param sections - Tile count per section.
 * @param columns - Tiles per row.
 * @returns The tiles' boxes in reading order.
 */
function layout(sections: number[], columns: number): TRect[] {
  const rects: TRect[] = [];
  let y = 0;

  for (const count of sections) {
    y += 30;

    for (let i = 0; i < count; i++) {
      rects.push({ x: (i % columns) * 60, y: y + Math.floor(i / columns) * 60, width: 56, height: 56 });
    }

    y += Math.ceil(count / columns) * 60;
  }

  return rects;
}

describe("nextTile", () => {
  // Section one: 0 1 2. Section two: 3 4 5 6, then 7 8 9.
  const rects = layout([3, 7], 4);

  it("moves along the reading order with left and right, stopping at the ends", () => {
    expect(nextTile(rects, 0, "ArrowRight")).toBe(1);
    expect(nextTile(rects, 2, "ArrowRight")).toBe(3);
    expect(nextTile(rects, 0, "ArrowLeft")).toBe(0);
    expect(nextTile(rects, 9, "ArrowRight")).toBe(9);
  });

  it("moves to the closest tile in the next row, across sections", () => {
    expect(nextTile(rects, 1, "ArrowDown")).toBe(4);
    expect(nextTile(rects, 4, "ArrowDown")).toBe(8);
    expect(nextTile(rects, 6, "ArrowDown")).toBe(9);
    expect(nextTile(rects, 7, "ArrowDown")).toBe(7);
  });

  it("moves up to the closest tile in the previous row", () => {
    expect(nextTile(rects, 8, "ArrowUp")).toBe(4);
    expect(nextTile(rects, 7, "ArrowUp")).toBe(3);
    expect(nextTile(rects, 6, "ArrowUp")).toBe(2);
    expect(nextTile(rects, 1, "ArrowUp")).toBe(1);
  });

  it("jumps to the first and last tile", () => {
    expect(nextTile(rects, 5, "Home")).toBe(0);
    expect(nextTile(rects, 5, "End")).toBe(9);
  });
});

describe("nextTile, by where tiles are", () => {
  const at = (x: number, y: number, width: number, height: number): TRect => ({ x, y, width, height });

  it("goes to the tile in the next row whose middle is closest, by width as well as place", () => {
    expect(nextTile([at(0, 0, 10, 10), at(0, 20, 2, 10), at(12, 20, 2, 10)], 0, "ArrowDown")).toBe(1);
    expect(nextTile([at(0, 20, 10, 10), at(0, 0, 2, 10), at(12, 0, 2, 10)], 0, "ArrowUp")).toBe(1);
  });

  it("takes a row by the middle of its tiles, by height as well as place", () => {
    expect(nextTile([at(0, 0, 10, 10), at(0, 12, 10, 2)], 0, "ArrowDown")).toBe(1);
    expect(nextTile([at(0, 0, 10, 10), at(0, 6, 10, 20)], 0, "ArrowDown")).toBe(1);
  });

  it("does not count a tile only half a row lower as the next row", () => {
    expect(nextTile([at(0, 0, 10, 10), at(20, 5, 10, 10)], 0, "ArrowDown")).toBe(0);
  });

  it("keeps to the nearest row, leaving out a tile half a row below it, and keeps the first of two as close", () => {
    expect(nextTile([at(0, 0, 10, 10), at(30, 20, 10, 10), at(0, 25, 10, 10)], 0, "ArrowDown")).toBe(1);
    expect(nextTile([at(10, 0, 10, 10), at(0, 20, 10, 10), at(20, 20, 10, 10)], 0, "ArrowDown")).toBe(1);
  });
});
