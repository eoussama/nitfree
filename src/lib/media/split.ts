/**
 * Splits animated GIFs and APNGs into one still image per frame, for browsers without ImageDecoder
 * (Safari): each still is a complete file the browser can decode itself, and the frames are then
 * composited on a canvas following each frame's position, disposal and blending.
 */

export type TDispose = "none" | "background" | "previous";

export type TSplitFrame = {
  bytes: Uint8Array<ArrayBuffer>;
  x: number;
  y: number;
  width: number;
  height: number;
  delay: number;
  dispose: TDispose;
  blend: "source" | "over";
};

export type TSplitImage = {
  mime: string;
  width: number;
  height: number;
  frames: TSplitFrame[];
  // How often the animation plays again after the first time: 0 for ever, -1 not at all.
  repeat: number;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

// Chunks that describe how to read the image data, kept in every frame's still.
const PNG_KEPT_CHUNKS = new Set(["PLTE", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT"]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;

  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }

  return c >>> 0;
});

/**
 * The CRC-32 PNG uses for its chunks.
 *
 * @param bytes - The chunk's type and data.
 * @returns The checksum.
 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;

  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8);
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

function le16(value: number): number[] {
  return [value & 0xFF, (value >>> 8) & 0xFF];
}

/**
 * Skips GIF data sub-blocks.
 *
 * @param bytes - The file.
 * @param offset - Where the first sub-block's size byte is.
 * @returns The offset past the terminating empty sub-block, or -1 when the file ends first.
 */
function skipSubBlocks(bytes: Uint8Array, offset: number): number {
  let position = offset;

  while (position < bytes.length && bytes[position] !== 0) {
    position += bytes[position]! + 1;
  }

  return position < bytes.length ? position + 1 : -1;
}

function colorTableSize(packed: number): number {
  return packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
}

/**
 * Splits a GIF into one single-image GIF per frame, sharing the global color table. Like a browser,
 * it plays what it could read of a damaged file.
 *
 * @param bytes - The GIF's bytes.
 * @returns The frames, or null when no frame could be read.
 */
export function splitGif(bytes: Uint8Array): TSplitImage | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length < 13 || String.fromCharCode(...bytes.subarray(0, 3)) !== "GIF") {
    return null;
  }

  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const globalPacked = bytes[10]!;
  const globalTable = bytes.subarray(13, 13 + colorTableSize(globalPacked));
  const frames: TSplitFrame[] = [];
  let control: Uint8Array | null = null;
  let repeat = -1;
  let position = 13 + globalTable.length;

  while (position < bytes.length && bytes[position] !== 0x3B) {
    const block = bytes[position];

    if (block === 0x21) {
      const label = bytes[position + 1];
      const end = skipSubBlocks(bytes, position + 2);

      if (end === -1) {
        break;
      }

      if (label === 0xF9 && bytes[position + 2] === 4) {
        control = bytes.slice(position, position + 8);
      }

      // The Netscape extension says how often the animation loops; 0 is for ever.
      if (label === 0xFF && bytes[position + 2] === 11 && String.fromCharCode(...bytes.subarray(position + 3, position + 14)) === "NETSCAPE2.0" && bytes[position + 15] === 1) {
        repeat = view.getUint16(position + 16, true);
      }

      position = end;
    }
    else if (block === 0x2C) {
      if (position + 10 > bytes.length) {
        break;
      }

      const packed = bytes[position + 9]!;
      const tableEnd = position + 10 + colorTableSize(packed);
      const end = skipSubBlocks(bytes, tableEnd + 1);

      if (end === -1) {
        break;
      }

      const frameWidth = view.getUint16(position + 5, true);
      const frameHeight = view.getUint16(position + 7, true);
      const disposal = control ? (control[3]! >>> 2) & 0x07 : 0;
      // The still keeps the frame's transparency but not its disposal, which the compositing applies.
      const stillControl = control ? Uint8Array.from(control, (byte, i) => (i === 3 ? byte & 0xE3 : byte)) : new Uint8Array();

      frames.push({
        bytes: concat([
          Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...le16(frameWidth), ...le16(frameHeight), globalPacked, 0, 0]),
          globalTable,
          stillControl,
          Uint8Array.from([0x2C, 0, 0, 0, 0, ...le16(frameWidth), ...le16(frameHeight), packed]),
          bytes.subarray(position + 10, end),
          Uint8Array.of(0x3B),
        ]),
        x: view.getUint16(position + 1, true),
        y: view.getUint16(position + 3, true),
        width: frameWidth,
        height: frameHeight,
        // The control block's delay is in hundredths of a second.
        delay: control ? (control[4]! | (control[5]! << 8)) * 10 : 0,
        dispose: disposal === 2 ? "background" : disposal === 3 ? "previous" : "none",
        blend: "over",
      });

      control = null;
      position = end;
    }
    else {
      break;
    }
  }

  return frames.length ? { mime: "image/gif", width, height, frames, repeat } : null;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const body = concat([Uint8Array.from(type, char => char.charCodeAt(0)), data]);
  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);

  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(body.length + 4, crc32(body));

  return out;
}

/**
 * Splits an APNG into one still PNG per frame. The default image only counts when the animation
 * includes it, as the format says. Like a browser, it plays what it could read of a damaged file.
 *
 * @param bytes - The APNG's bytes.
 * @returns The frames, or null when no frame could be read.
 */
export function splitApng(bytes: Uint8Array): TSplitImage | null {
  if (bytes.length < 8 || !PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [];
  const frames: Array<Omit<TSplitFrame, "bytes"> & { data: Uint8Array[] }> = [];
  let header: Uint8Array | null = null;
  let seenImageData = false;
  let repeat = 0;
  let position = 8;

  while (position + 12 <= bytes.length) {
    const length = view.getUint32(position);
    const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8));
    const data = bytes.subarray(position + 8, position + 8 + length);

    if (position + 12 + length > bytes.length) {
      break;
    }

    if (type === "IHDR") {
      header = data.slice();
    }
    else if (type === "acTL" && length >= 8) {
      // APNG counts plays, 0 for ever; GIF counts plays after the first.
      const plays = view.getUint32(position + 8 + 4);

      repeat = plays === 0 ? 0 : plays === 1 ? -1 : plays - 1;
    }
    else if (type === "fcTL" && length >= 26) {
      const den = view.getUint16(position + 8 + 22);

      frames.push({
        width: view.getUint32(position + 8 + 4),
        height: view.getUint32(position + 8 + 8),
        x: view.getUint32(position + 8 + 12),
        y: view.getUint32(position + 8 + 16),
        delay: (view.getUint16(position + 8 + 20) / (den || 100)) * 1000,
        dispose: data[24] === 1 ? "background" : data[24] === 2 ? "previous" : "none",
        blend: data[25] === 1 ? "over" : "source",
        data: [],
      });
    }
    else if (type === "IDAT") {
      seenImageData = true;
      frames.at(-1)?.data.push(data);
    }
    else if (type === "fdAT") {
      frames.at(-1)?.data.push(data.subarray(4));
    }
    else if (type === "IEND") {
      break;
    }
    else if (!seenImageData && PNG_KEPT_CHUNKS.has(type)) {
      kept.push(bytes.subarray(position, position + 12 + length));
    }

    position += 12 + length;
  }

  const playable = frames.filter(frame => frame.data.length);

  if (!header || !playable.length) {
    return null;
  }

  const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);

  return {
    mime: "image/png",
    width: headerView.getUint32(0),
    height: headerView.getUint32(4),
    repeat,
    frames: playable.map(({ data, ...frame }, index) => {
      const frameHeader = header.slice();
      const frameView = new DataView(frameHeader.buffer);

      frameView.setUint32(0, frame.width);
      frameView.setUint32(4, frame.height);

      return {
        ...frame,
        // A first frame cannot restore what came before it, so it clears instead.
        dispose: index === 0 && frame.dispose === "previous" ? "background" : frame.dispose,
        bytes: concat([
          Uint8Array.from(PNG_SIGNATURE),
          pngChunk("IHDR", frameHeader),
          ...kept,
          pngChunk("IDAT", concat(data)),
          pngChunk("IEND", new Uint8Array()),
        ]),
      };
    }),
  };
}
