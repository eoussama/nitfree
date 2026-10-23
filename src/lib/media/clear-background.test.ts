import type { TColor } from "./edit";

import { describe, expect, it } from "vitest";

import { clearBackground } from "./edit";



/**
 * The background removal written as plainly as it can be, to check the real one against: every
 * pixel close enough to the color that can be reached from an edge through pixels like it goes, and
 * those just past the tolerance beside them are faded.
 *
 * @param input - The pixels.
 * @param width - The image's width.
 * @param height - The image's height.
 * @param color - The background's color.
 * @param tolerance - How far a pixel may be from it, from 0 to 100.
 * @returns The pixels, cleared.
 */
function reference(input: Uint8ClampedArray, width: number, height: number, color: TColor, tolerance: number): Uint8ClampedArray {
  const rgba = Uint8ClampedArray.from(input);
  const limit = (Math.min(Math.max(tolerance, 0), 100) / 100) * 255;
  const at = (x: number, y: number) => (y * width + x) * 4;
  const distance = (x: number, y: number) => Math.max(...[0, 1, 2].map(c => Math.abs(input[at(x, y) + c]! - color[c]!)));
  const isBackground = (x: number, y: number) => input[at(x, y) + 3] === 0 || distance(x, y) <= limit;
  const cleared = Array.from({ length: height }, () => Array.from({ length: width }).fill(false));
  const queue: [number, number][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && isBackground(x, y)) {
        cleared[y]![x] = true;
        queue.push([x, y]);
      }
    }
  }

  while (queue.length) {
    const [x, y] = queue.shift()!;

    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && !cleared[ny]![nx] && isBackground(nx, ny)) {
        cleared[ny]![nx] = true;
        queue.push([nx, ny]);
      }
    }
  }

  const isCleared = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && cleared[y]![x];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(x, y);

      if (cleared[y]![x]) {
        rgba.fill(0, i, i + 4);
      }
      else if (limit > 0 && [isCleared(x - 1, y), isCleared(x + 1, y), isCleared(x, y - 1), isCleared(x, y + 1)].some(Boolean)) {
        const d = distance(x, y);

        if (d < limit * 2) {
          rgba[i + 3] = Math.round(input[i + 3]! * ((d - limit) / limit));
        }
      }
    }
  }

  return rgba;
}

/**
 * A small generator of repeatable random numbers, so a failing image can be found again.
 *
 * @param seed - Where the numbers start.
 * @returns The next number, from 0 to 1, each call.
 */
function random(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;

    return state / 2_147_483_648;
  };
}

// Colors near the background and far from it, and see-through pixels, so the fill has edges to stop at.
const PALETTE = [[255, 255, 255, 255], [250, 248, 252, 255], [230, 235, 228, 255], [255, 0, 0, 255], [10, 20, 30, 255], [128, 128, 128, 200], [0, 0, 0, 0]];

function picture(next: () => number, width: number, height: number): Uint8ClampedArray {
  return Uint8ClampedArray.from(Array.from({ length: width * height }, () => PALETTE[Math.floor(next() * PALETTE.length)]!).flat());
}

describe("clearBackground against a plain flood fill", () => {
  it("clears and softens exactly what it should, on hundreds of random images", () => {
    const next = random(7);

    for (let run = 0; run < 400; run++) {
      const width = 1 + Math.floor(next() * 7);
      const height = 1 + Math.floor(next() * 7);
      const input = picture(next, width, height);
      const tolerance = [0, 1, 3, 8, 12, 40, 100, 150, -10][run % 9]!;
      const actual = Uint8ClampedArray.from(input);

      clearBackground(actual, width, height, [255, 255, 255], tolerance);
      expect([...actual], `${width}×${height} at ${tolerance}`).toEqual([...reference(input, width, height, [255, 255, 255], tolerance)]);
    }
  });

  it("finds the background of another color, and leaves an image with no background alone", () => {
    const next = random(11);
    const input = picture(next, 6, 5);
    const actual = Uint8ClampedArray.from(input);

    clearBackground(actual, 6, 5, [10, 20, 30], 5);
    expect([...actual]).toEqual([...reference(input, 6, 5, [10, 20, 30], 5)]);

    const red = Uint8ClampedArray.from(Array.from({ length: 9 }, () => [255, 0, 0, 255]).flat());

    clearBackground(red, 3, 3, [0, 0, 255], 10);
    expect([...red]).toEqual(Array.from({ length: 9 }, () => [255, 0, 0, 255]).flat());
  });
});
