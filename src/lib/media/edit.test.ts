import { describe, expect, it } from "vitest";

import { clampRect, clearBackground, dragRect, editedFileName, hasEdits, isFullRect, moveRect, NO_EDITS, resizeRect, squareWithin } from "./edit";



const SIZE = { width: 100, height: 60 };

/**
 * An image from rows of letters: W is white, R red, and . transparent.
 *
 * @param rows - The rows.
 * @returns The pixels.
 */
function image(rows: string[]): Uint8ClampedArray {
  const colors: Record<string, number[]> = { "W": [255, 255, 255, 255], "w": [250, 250, 250, 255], "R": [255, 0, 0, 255], ".": [0, 0, 0, 0] };

  return Uint8ClampedArray.from(rows.flatMap(row => [...row].flatMap(char => colors[char]!)));
}

function alphas(rgba: Uint8ClampedArray, width: number): string[] {
  const rows: string[] = [];

  for (let i = 0; i < rgba.length / 4; i += width) {
    rows.push(Array.from({ length: width }, (_, x) => (rgba[(i + x) * 4 + 3] === 0 ? "." : "#")).join(""));
  }

  return rows;
}

describe("editedFileName", () => {
  it("keeps the name and takes the extension of what the file became", () => {
    expect(editedFileName("party.parrot.png", "image/gif")).toBe("party.parrot.gif");
    expect(editedFileName("wave", "image/png")).toBe("wave.png");
    expect(editedFileName(".png", "image/png")).toBe("image.png");
  });
});

describe("crop rectangles", () => {
  it("takes the largest square in the middle", () => {
    expect(squareWithin({ x: 0, y: 0, width: 100, height: 60 })).toEqual({ x: 20, y: 0, width: 60, height: 60 });
    expect(squareWithin({ x: 10, y: 5, width: 20, height: 41 })).toEqual({ x: 10, y: 15, width: 20, height: 20 });
  });

  it("drags from a corner in any direction, inside the image", () => {
    expect(dragRect({ x: 10, y: 10 }, { x: 40, y: 30 }, SIZE, false)).toEqual({ x: 10, y: 10, width: 30, height: 20 });
    expect(dragRect({ x: 40, y: 30 }, { x: 10, y: 10 }, SIZE, false)).toEqual({ x: 10, y: 10, width: 30, height: 20 });
    expect(dragRect({ x: 90, y: 50 }, { x: 500, y: -20 }, SIZE, false)).toEqual({ x: 90, y: 0, width: 10, height: 50 });
  });

  it("keeps a dragged square square, as large as the image allows", () => {
    expect(dragRect({ x: 10, y: 10 }, { x: 40, y: 20 }, SIZE, true)).toEqual({ x: 10, y: 10, width: 30, height: 30 });
    expect(dragRect({ x: 10, y: 10 }, { x: 90, y: 90 }, SIZE, true)).toEqual({ x: 10, y: 10, width: 50, height: 50 });
    expect(dragRect({ x: 50, y: 50 }, { x: 0, y: 45 }, SIZE, true)).toEqual({ x: 0, y: 0, width: 50, height: 50 });
  });

  it("never makes an empty rectangle", () => {
    expect(dragRect({ x: 10, y: 10 }, { x: 10, y: 10 }, SIZE, false)).toEqual({ x: 10, y: 10, width: 1, height: 1 });
  });

  it("moves and resizes without leaving the image", () => {
    const rect = { x: 10, y: 10, width: 30, height: 30 };

    expect(moveRect(rect, 100, -100, SIZE)).toEqual({ x: 70, y: 0, width: 30, height: 30 });
    expect(resizeRect(rect, 100, 0, SIZE, false)).toEqual({ x: 10, y: 10, width: 90, height: 30 });
    expect(resizeRect(rect, 100, 0, SIZE, true)).toEqual({ x: 10, y: 10, width: 50, height: 50 });
    expect(resizeRect(rect, 0, -100, SIZE, true)).toEqual({ x: 10, y: 10, width: 1, height: 1 });
    expect(clampRect({ x: -5, y: 50, width: 200, height: 20 }, SIZE)).toEqual({ x: 0, y: 40, width: 100, height: 20 });
  });

  it("knows the whole image from a crop, every side of it", () => {
    expect(isFullRect({ x: 0, y: 0, width: 100, height: 60 }, SIZE)).toBe(true);
    expect(isFullRect({ x: 0, y: 0, width: 60, height: 60 }, SIZE)).toBe(false);
    expect(isFullRect({ x: 1, y: 0, width: 100, height: 60 }, SIZE)).toBe(false);
    expect(isFullRect({ x: 0, y: 1, width: 100, height: 60 }, SIZE)).toBe(false);
    expect(isFullRect({ x: 0, y: 0, width: 100, height: 59 }, SIZE)).toBe(false);
  });

  it("keeps a square dragged toward the far edges within the room on that side", () => {
    // From (90, 10) right and down: only 10 pixels of room to the right.
    expect(dragRect({ x: 90, y: 10 }, { x: 99, y: 59 }, SIZE, true)).toEqual({ x: 90, y: 10, width: 10, height: 10 });
    // From (10, 50) right and down: only 10 pixels of room below.
    expect(dragRect({ x: 10, y: 50 }, { x: 99, y: 59 }, SIZE, true)).toEqual({ x: 10, y: 50, width: 10, height: 10 });
  });

  it("resizes within the room left beyond the rectangle's corner", () => {
    const rect = { x: 60, y: 30, width: 20, height: 20 };

    expect(resizeRect(rect, 100, 0, SIZE, true)).toEqual({ x: 60, y: 30, width: 30, height: 30 });
    expect(resizeRect({ ...rect, y: 10 }, 100, 0, SIZE, true)).toEqual({ x: 60, y: 10, width: 40, height: 40 });
    expect(resizeRect(rect, 0, 100, SIZE, false)).toEqual({ x: 60, y: 30, width: 20, height: 30 });
    expect(resizeRect(rect, 0, 5, SIZE, false)).toEqual({ x: 60, y: 30, width: 20, height: 25 });
    expect(resizeRect(rect, 0, -5, SIZE, false)).toEqual({ x: 60, y: 30, width: 20, height: 15 });
  });
});

describe("clearBackground", () => {
  it("clears the background reached from the edges, keeping the same color inside the subject", () => {
    const rgba = image([
      "WWWWW",
      "WRRRW",
      "WRWRW",
      "WRRRW",
      "WWWWW",
    ]);

    clearBackground(rgba, 5, 5, [255, 255, 255], 0);

    expect(alphas(rgba, 5)).toEqual([
      ".....",
      ".###.",
      ".###.",
      ".###.",
      ".....",
    ]);
  });

  it("takes colors within the tolerance, and crosses transparent pixels", () => {
    const rgba = image([
      "Ww.wW",
      "wRRRw",
      "WRRRW",
    ]);

    clearBackground(rgba, 5, 3, [255, 255, 255], 0);
    expect(alphas(rgba, 5)).toEqual([".#.#.", "#####", ".###."]);

    const again = image(["Ww.wW", "wRRRw", "WRRRW"]);

    clearBackground(again, 5, 3, [255, 255, 255], 5);
    expect(alphas(again, 5)).toEqual([".....", ".###.", ".###."]);
  });

  it("softens pixels just past the tolerance next to the cleared background", () => {
    const rgba = image(["WwR"]);

    // 250 is 5 away from white: past a tolerance of 1.5 (3.8), within twice it.
    clearBackground(rgba, 3, 1, [255, 255, 255], 1.5);

    expect(rgba[3]).toBe(0);
    expect(rgba[7]).toBeGreaterThan(0);
    expect(rgba[7]).toBeLessThan(255);
    expect(rgba[11]).toBe(255);
  });
});

describe("edits", () => {
  it("knows when nothing is edited, and each edit on its own", () => {
    expect(hasEdits(NO_EDITS)).toBe(false);
    expect(hasEdits({ ...NO_EDITS, trim: { start: 1, end: 3 } })).toBe(true);
    expect(hasEdits({ ...NO_EDITS, crop: { x: 0, y: 0, width: 1, height: 1 } })).toBe(true);
    expect(hasEdits({ ...NO_EDITS, background: { color: [0, 0, 0], tolerance: 1 } })).toBe(true);
  });

  it("names the edited file after the original, with its new extension", () => {
    expect(editedFileName("party parrot.webp", "image/gif")).toBe("party parrot.gif");
    expect(editedFileName("photo.jpg", "image/png")).toBe("photo.png");
  });
});
