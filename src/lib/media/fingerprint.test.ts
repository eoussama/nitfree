import { afterEach, describe, expect, it, vi } from "vitest";

import { fileOf, installCanvas, paintedCanvas } from "~/test/canvas";

import { png } from "~/test/fixtures";
import { fingerprintBands, fingerprintPixels, hashDistance, imageFingerprint, isSimilar } from "./fingerprint";



type TColor = [number, number, number, number];

// The 9 by 8 pixels a fingerprint is made from.
function pixels(color: (x: number, y: number) => TColor): number[] {
  return Array.from({ length: 8 }, (_, y) => Array.from({ length: 9 }, (_, x) => color(x, y))).flat(2);
}

const solid = (color: TColor) => pixels(() => color);

describe("fingerprintPixels", () => {
  it("sets a bit where a pixel is brighter than the one to its right, then adds the average color", () => {
    const fading = pixels(x => [255 - x * 30, 255 - x * 30, 255 - x * 30, 255]);
    const rising = pixels(x => [x * 30, x * 30, x * 30, 255]);

    expect(fingerprintPixels(fading).slice(0, 16)).toBe("ffffffffffffffff");
    expect(fingerprintPixels(rising).slice(0, 16)).toBe("0000000000000000");
    expect(fingerprintPixels(solid([255, 0, 0, 255]))).toBe("0000000000000000ff0000");
  });

  it("sees transparent pixels as white", () => {
    expect(fingerprintPixels(solid([0, 0, 0, 0]))).toBe(fingerprintPixels(solid([255, 255, 255, 255])));
  });
});

describe("comparing fingerprints", () => {
  it("counts the bits two hashes differ by", () => {
    expect(hashDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hashDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hashDistance("0f00000000000001", "0000000000000000")).toBe(5);
  });

  it("matches hashes at most 6 bits apart and colors close together", () => {
    expect(isSimilar("0000000000000000808080", "3f00000000000000808080")).toBe(true);
    expect(isSimilar("0000000000000000808080", "7f00000000000000808080")).toBe(false);
    expect(isSimilar("0000000000000000808080", "0000000000000000909090")).toBe(true);
    expect(isSimilar("0000000000000000ff0000", "00000000000000000000ff")).toBe(false);
  });

  it("splits a hash into bands, of which similar ones share at least one", () => {
    const a = "0123456789abcdef000000";
    const b = "f123456789abcdee000000";

    expect(fingerprintBands(a)).toEqual(["0:01", "1:23", "2:45", "3:67", "4:89", "5:ab", "6:cd", "7:ef"]);
    expect(fingerprintBands(a).filter(band => fingerprintBands(b).includes(band))).toHaveLength(6);
  });
});

describe("imageFingerprint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is none where the browser cannot decode or draw images", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    expect(await imageFingerprint(new Blob(["x"]))).toBeNull();

    installCanvas();
    vi.stubGlobal("OffscreenCanvas", undefined);
    expect(await imageFingerprint(new Blob(["x"]))).toBeNull();
  });

  it("is none for a file that cannot be decoded", async () => {
    installCanvas();
    expect(await imageFingerprint(new Blob(["not an image"]))).toBeNull();
  });

  it("is made from the picture, a transparent one counting as white", async () => {
    installCanvas();
    expect(await imageFingerprint(new Blob([png(32, 32)]))).toBe("0000000000000000ffffff");
    expect(await imageFingerprint(await fileOf(paintedCanvas(32, 32, "#ff0000")))).toBe("0000000000000000ff0000");
  });
});

describe("fingerprints, in detail", () => {
  // The brightness a fingerprint compares, written out plainly: the pixel over white.
  function reference(rgba: number[]): string {
    const bright = (i: number) => {
      const alpha = rgba[i + 3]! / 255;

      return (0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!) * alpha + 255 * (1 - alpha);
    };
    let hash = "";

    for (let y = 0; y < 8; y++) {
      let bits = 0;

      for (let x = 0; x < 8; x++) {
        bits = bits * 2 + (bright((y * 9 + x) * 4) > bright((y * 9 + x + 1) * 4) ? 1 : 0);
      }

      hash += bits.toString(16).padStart(2, "0");
    }

    return hash;
  }

  it("compares pixels by how bright they show over white, see-through ones included", () => {
    let state = 3;
    const next = () => (state = (state * 1_103_515_245 + 12_345) % 2_147_483_648) % 256;

    for (let run = 0; run < 100; run++) {
      const rgba = Array.from({ length: 9 * 8 * 4 }, next);

      expect(fingerprintPixels(rgba).slice(0, 16)).toBe(reference(rgba));
    }
  });

  it("counts only the hash's bits apart, not the color's", () => {
    expect(hashDistance("0000000000000000000000", "0000000000000000ffffff")).toBe(0);
  });

  it("takes colors exactly as far apart as it allows as the same", () => {
    expect(isSimilar("0000000000000000000000", "0000000000000000181818")).toBe(true);
    expect(isSimilar("0000000000000000000000", "0000000000000000191919")).toBe(false);
  });

  it("makes none where the page cannot draw, and closes what it decoded", async () => {
    installCanvas();
    vi.stubGlobal("OffscreenCanvas", undefined);
    expect(await imageFingerprint(new Blob([png(4, 4)]))).toBeNull();

    installCanvas();
    vi.stubGlobal("createImageBitmap", undefined);
    expect(await imageFingerprint(new Blob([png(4, 4)]))).toBeNull();

    installCanvas();

    const decode = globalThis.createImageBitmap;
    const bitmaps: { closed: boolean }[] = [];

    vi.stubGlobal("createImageBitmap", async (file: Blob) => {
      const bitmap = await decode(file);

      bitmaps.push(bitmap as never);

      return bitmap;
    });
    await imageFingerprint(new Blob([png(4, 4)]));
    expect(bitmaps.map(bitmap => bitmap.closed)).toEqual([true]);
  });
});
