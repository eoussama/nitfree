export type TImageFormat = "png" | "gif" | "webp" | "jpeg";

export type TImageInfo = {
  format: TImageFormat;
  mime: string;
  width: number;
  height: number;
  animated: boolean;
};

const MIME_TYPES: Record<TImageFormat, string> = {
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];



function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

function info(format: TImageFormat, width: number, height: number, animated: boolean): TImageInfo | null {
  return width > 0 && height > 0 ? { format, mime: MIME_TYPES[format], width, height, animated } : null;
}

/**
 * PNG and APNG: size from IHDR, animated when an acTL chunk before the image data declares several frames.
 *
 * @param bytes - The file's bytes.
 * @param view - A view over the same bytes.
 * @returns The image info, or null if the file is malformed.
 */
function inspectPng(bytes: Uint8Array, view: DataView): TImageInfo | null {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") {
    return null;
  }

  let animated = false;

  for (let offset = 8; offset + 8 <= bytes.length;) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);

    if (type === "IDAT") {
      break;
    }

    if (type === "acTL" && offset + 12 <= bytes.length) {
      animated = view.getUint32(offset + 8) > 1;
    }

    offset += 12 + length;
  }

  return info("png", view.getUint32(16), view.getUint32(20), animated);
}

/**
 * Skips a run of GIF data sub-blocks.
 *
 * @param bytes - The file's bytes.
 * @param offset - Where the first sub-block's size byte is.
 * @returns The offset after the terminating empty sub-block.
 */
function skipSubBlocks(bytes: Uint8Array, offset: number): number {
  let position = offset;

  while (position < bytes.length && bytes[position] !== 0) {
    position += bytes[position]! + 1;
  }

  return position + 1;
}

/**
 * GIF: size from the logical screen, animated when it holds more than one image.
 *
 * @param bytes - The file's bytes.
 * @param view - A view over the same bytes.
 * @returns The image info, or null if the file is malformed.
 */
function inspectGif(bytes: Uint8Array, view: DataView): TImageInfo | null {
  if (bytes.length < 13) {
    return null;
  }

  const flags = bytes[10]!;
  let offset = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0);
  let frames = 0;

  while (offset < bytes.length && frames < 2) {
    const block = bytes[offset];

    if (block === 0x21) {
      offset = skipSubBlocks(bytes, offset + 2);
    }
    else if (block === 0x2C) {
      frames++;

      const local = bytes[offset + 9] ?? 0;

      offset += 10 + (local & 0x80 ? 3 * 2 ** ((local & 0x07) + 1) : 0);
      offset = skipSubBlocks(bytes, offset + 1);
    }
    else {
      break;
    }
  }

  return info("gif", view.getUint16(6, true), view.getUint16(8, true), frames > 1);
}

/**
 * WebP: size from the VP8, VP8L or VP8X header, animated when VP8X sets its animation flag.
 *
 * @param bytes - The file's bytes.
 * @param view - A view over the same bytes.
 * @returns The image info, or null if the file is malformed.
 */
function inspectWebp(bytes: Uint8Array, view: DataView): TImageInfo | null {
  if (bytes.length < 30) {
    return null;
  }

  const chunk = ascii(bytes, 12, 4);
  const data = 20;

  if (chunk === "VP8X") {
    const width = 1 + (view.getUint32(data + 4, true) & 0xFFFFFF);
    const height = 1 + (view.getUint32(data + 6, true) >>> 8);

    return info("webp", width, height, (bytes[data]! & 0x02) !== 0);
  }

  if (chunk === "VP8L" && bytes[data] === 0x2F) {
    const bits = view.getUint32(data + 1, true);

    return info("webp", 1 + (bits & 0x3FFF), 1 + ((bits >>> 14) & 0x3FFF), false);
  }

  if (chunk === "VP8 " && bytes[data + 3] === 0x9D && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2A) {
    return info("webp", view.getUint16(data + 6, true) & 0x3FFF, view.getUint16(data + 8, true) & 0x3FFF, false);
  }

  return null;
}

/**
 * JPEG: size from the first start-of-frame segment.
 *
 * @param bytes - The file's bytes.
 * @param view - A view over the same bytes.
 * @returns The image info, or null if the file is malformed.
 */
function inspectJpeg(bytes: Uint8Array, view: DataView): TImageInfo | null {
  let offset = 2;

  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xFF) {
      return null;
    }

    const marker = bytes[offset + 1]!;

    if (marker === 0xFF) {
      offset++;
      continue;
    }

    const isFrame = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;

    if (isFrame) {
      return info("jpeg", view.getUint16(offset + 7), view.getUint16(offset + 5), false);
    }

    offset += 2 + view.getUint16(offset + 2);
  }

  return null;
}

/**
 * Reads an image's format, size and whether it is animated from its bytes, without decoding it.
 * Works the same in a service worker, an extension page and tests.
 *
 * @param bytes - The file's bytes.
 * @returns The image info, or null for formats Nitfree does not accept (PNG, APNG, GIF, WebP and JPEG).
 */
export function inspectImage(bytes: Uint8Array): TImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (startsWith(bytes, PNG_SIGNATURE)) {
    return inspectPng(bytes, view);
  }

  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return inspectGif(bytes, view);
  }

  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return inspectWebp(bytes, view);
  }

  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    return inspectJpeg(bytes, view);
  }

  return null;
}
