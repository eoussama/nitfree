import { tryCatch } from "@eoussama/core";

import { drawScaled } from "./resize";



/**
 * The difference hash compares each pixel of a 9 by 8 copy with the one to its right: 64 bits.
 */
const COLUMNS = 9;
const ROWS = 8;

/**
 * Fingerprints at most this many bits apart, out of 64, count as the same picture.
 */
const MAX_DISTANCE = 6;

/**
 * Average colors at most this far apart, on each channel out of 255, count as the same.
 */
const MAX_COLOR_DIFFERENCE = 24;

/**
 * Bits set in each hex digit.
 */
const BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

// A pixel's brightness, as it shows over a white background.
function brightness(rgba: ArrayLike<number>, index: number): number {
  const alpha = rgba[index + 3]! / 255;
  const luma = 0.299 * rgba[index]! + 0.587 * rgba[index + 1]! + 0.114 * rgba[index + 2]!;

  return luma * alpha + 255 * (1 - alpha);
}

function hex(value: number, digits: number): string {
  return value.toString(16).padStart(digits, "0");
}

/**
 * Fingerprints a small copy of an image: a difference hash of its shapes, then its average color, so
 * images of the same shapes in other colors, such as two flat squares, do not match.
 *
 * @param rgba - The copy's pixels, 9 wide and 8 high.
 * @returns 16 hex digits of hash, then 6 of color.
 */
export function fingerprintPixels(rgba: ArrayLike<number>): string {
  let hash = "";
  const sums = [0, 0, 0];

  for (let y = 0; y < ROWS; y++) {
    let bits = 0;

    for (let x = 0; x < COLUMNS - 1; x++) {
      const index = (y * COLUMNS + x) * 4;

      bits = (bits << 1) | (brightness(rgba, index) > brightness(rgba, index + 4) ? 1 : 0);
    }

    hash += hex(bits, 2);
  }

  for (let index = 0; index < COLUMNS * ROWS * 4; index += 4) {
    const alpha = rgba[index + 3]! / 255;

    for (let channel = 0; channel < 3; channel++) {
      sums[channel]! += rgba[index + channel]! * alpha + 255 * (1 - alpha);
    }
  }

  return hash + sums.map(sum => hex(Math.round(sum / (COLUMNS * ROWS)), 2)).join("");
}

/**
 * How many bits two fingerprints' hashes differ by.
 *
 * @param a - A fingerprint.
 * @param b - Another.
 * @returns The distance, from 0 to 64.
 */
export function hashDistance(a: string, b: string): number {
  let distance = 0;

  for (let i = 0; i < 16; i++) {
    distance += BITS[Number.parseInt(a[i]!, 16) ^ Number.parseInt(b[i]!, 16)]!;
  }

  return distance;
}

/**
 * Whether two fingerprints are of the same picture, maybe resized or saved in another format.
 *
 * @param a - A fingerprint.
 * @param b - Another.
 * @returns Whether they match.
 */
export function isSimilar(a: string, b: string): boolean {
  for (let i = 16; i < 22; i += 2) {
    if (Math.abs(Number.parseInt(a.slice(i, i + 2), 16) - Number.parseInt(b.slice(i, i + 2), 16)) > MAX_COLOR_DIFFERENCE) {
      return false;
    }
  }

  return hashDistance(a, b) <= MAX_DISTANCE;
}

/**
 * The parts of a fingerprint's hash that two similar fingerprints always share at least one of: with
 * at most 6 bits apart, at least 2 of the 8 bytes are the same.
 *
 * @param fingerprint - A fingerprint.
 * @returns One key per byte of its hash.
 */
export function fingerprintBands(fingerprint: string): string[] {
  return Array.from({ length: 8 }, (_, band) => `${band}:${fingerprint.slice(band * 2, band * 2 + 2)}`);
}

/**
 * Fingerprints an image, its first frame when animated, to find near-identical ones.
 *
 * @param file - The image.
 * @returns The fingerprint, or null where it cannot be decoded.
 */
export async function imageFingerprint(file: Blob): Promise<string | null> {
  if (typeof createImageBitmap === "undefined" || typeof OffscreenCanvas === "undefined") {
    return null;
  }

  const [error, bitmap] = await tryCatch(createImageBitmap(file));

  if (error) {
    return null;
  }

  try {
    const canvas = drawScaled(bitmap, bitmap, { width: COLUMNS, height: ROWS });

    return fingerprintPixels(canvas.getContext("2d")!.getImageData(0, 0, COLUMNS, ROWS).data);
  }
  finally {
    bitmap.close();
  }
}
