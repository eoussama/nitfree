/**
 * Smallest valid headers for each accepted format, for tests. Only the parts Nitfree reads are meaningful.
 */

function bytes(...parts: Array<number[] | string>): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(parts.flatMap(part => (typeof part === "string" ? [...part].map(char => char.charCodeAt(0)) : part)));
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF];
}

function u16le(value: number): number[] {
  return [value & 0xFF, (value >>> 8) & 0xFF];
}

function u24le(value: number): number[] {
  return [value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF];
}

function chunk(type: string, data: number[]): Array<number[] | string> {
  return [u32(data.length), type, data, [0, 0, 0, 0]];
}

/**
 * A PNG, animated when `frames` is above one.
 *
 * @param width - Image width.
 * @param height - Image height.
 * @param frames - Frame count declared by an acTL chunk; omitted for a still PNG.
 * @returns The file's bytes.
 */
export function png(width: number, height: number, frames?: number): Uint8Array<ArrayBuffer> {
  return bytes(
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    ...chunk("IHDR", [...u32(width), ...u32(height), 8, 6, 0, 0, 0]),
    ...(frames === undefined ? [] : chunk("acTL", [...u32(frames), ...u32(0)])),
    ...chunk("IDAT", [0]),
    ...chunk("IEND", []),
  );
}

/**
 * A GIF with a global color table and one or more frames.
 *
 * @param width - Image width.
 * @param height - Image height.
 * @param frames - Number of images in the file.
 * @returns The file's bytes.
 */
export function gif(width: number, height: number, frames: number): Uint8Array<ArrayBuffer> {
  const frame = [
    [0x21, 0xF9, 0x04, 0x00, 0x0A, 0x00, 0x00, 0x00],
    [0x2C, ...u16le(0), ...u16le(0), ...u16le(width), ...u16le(height), 0x00],
    [0x02, 0x02, 0x44, 0x01, 0x00],
  ];

  return bytes(
    "GIF89a",
    [...u16le(width), ...u16le(height), 0x80, 0x00, 0x00],
    [0, 0, 0, 255, 255, 255],
    ...Array.from<number[][]>({ length: frames }).fill(frame).flat(),
    [0x3B],
  );
}

/**
 * A lossless WebP (VP8L).
 *
 * @param width - Image width.
 * @param height - Image height.
 * @returns The file's bytes.
 */
export function webpLossless(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bits = ((width - 1) & 0x3FFF) | (((height - 1) & 0x3FFF) << 14);

  return bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8L", u32(10).reverse(), [0x2F, bits & 0xFF, (bits >>> 8) & 0xFF, (bits >>> 16) & 0xFF, (bits >>> 24) & 0xFF], [0, 0, 0, 0, 0]);
}

/**
 * A lossy WebP (VP8).
 *
 * @param width - Image width.
 * @param height - Image height.
 * @returns The file's bytes.
 */
export function webpLossy(width: number, height: number): Uint8Array<ArrayBuffer> {
  return bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", u32(10).reverse(), [0, 0, 0, 0x9D, 0x01, 0x2A, ...u16le(width), ...u16le(height)]);
}

/**
 * An extended WebP (VP8X), animated or not.
 *
 * @param width - Canvas width.
 * @param height - Canvas height.
 * @param animated - Whether the animation flag is set.
 * @returns The file's bytes.
 */
export function webpExtended(width: number, height: number, animated: boolean): Uint8Array<ArrayBuffer> {
  return bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", u32(10).reverse(), [animated ? 0x02 : 0x00, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]);
}

/**
 * A baseline JPEG with an APP0 segment before its frame header.
 *
 * @param width - Image width.
 * @param height - Image height.
 * @returns The file's bytes.
 */
export function jpeg(width: number, height: number): Uint8Array<ArrayBuffer> {
  return bytes(
    [0xFF, 0xD8],
    [0xFF, 0xE0, 0x00, 0x10],
    "JFIF",
    [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
    [0xFF, 0xC0, 0x00, 0x11, 0x08, (height >>> 8) & 0xFF, height & 0xFF, (width >>> 8) & 0xFF, width & 0xFF, 0x03],
    [0xFF, 0xD9],
  );
}
