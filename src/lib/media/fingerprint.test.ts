import { describe, expect, it } from "vitest";

import { fingerprintBands, fingerprintPixels, hashDistance, isSimilar } from "./fingerprint";



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
