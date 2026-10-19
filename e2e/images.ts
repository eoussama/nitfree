import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import zlib from "node:zlib";



// gifenc's Node build is CommonJS, whose named exports Node cannot detect for an import.
const { applyPalette, GIFEncoder, quantize } = createRequire(import.meta.url)("gifenc") as typeof import("gifenc");



type TColor = [number, number, number, number];

/**
 * A blob as the messaging codec sends it.
 */
export type TEncodedBlob = { $nf: "blob"; type: string; data: string };

function encoded(type: string, bytes: Uint8Array): TEncodedBlob {
  return { $nf: "blob", type, data: Buffer.from(bytes).toString("base64") };
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(zlib.crc32(body));

  return Buffer.concat([length, body, crc]);
}

/**
 * A real, single-color PNG.
 *
 * @param width - Image width.
 * @param height - Image height.
 * @param color - Its RGBA color.
 * @param padding - Bytes added after the image, to make a large file.
 * @returns The PNG, encoded for a request.
 */
export function png(width: number, height: number, color: TColor = [88, 101, 242, 255], padding = 0): TEncodedBlob {
  const row = 1 + width * 4;
  const raw = Buffer.alloc(row * height);
  const header = Buffer.alloc(13);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      raw.set(color, y * row + 1 + x * 4);
    }
  }

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);

  return encoded("image/png", Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
    Buffer.alloc(padding),
  ]));
}

/**
 * A real animated GIF, one solid color per frame.
 *
 * @param width - Image width.
 * @param height - Image height.
 * @param colors - One color per frame.
 * @param delay - How long each frame shows, in milliseconds.
 * @param repeat - How often it plays again: 0 for ever, -1 not at all.
 * @returns The GIF, encoded for a request.
 */
export function gif(width: number, height: number, colors: TColor[], delay = 120, repeat = 0): TEncodedBlob {
  const encoder = GIFEncoder();

  for (const color of colors) {
    const rgba = Uint8Array.from({ length: width * height * 4 }, (_, i) => color[i % 4]!);
    const palette = quantize(rgba, 4, { format: "rgba4444", oneBitAlpha: true });

    const transparentIndex = palette.findIndex(entry => entry[3] === 0);

    encoder.writeFrame(applyPalette(rgba, palette, "rgba4444"), width, height, {
      palette,
      delay,
      dispose: 2,
      repeat,
      transparent: transparentIndex !== -1,
      transparentIndex: Math.max(transparentIndex, 0),
    });
  }

  encoder.finish();

  return encoded("image/gif", encoder.bytes());
}
