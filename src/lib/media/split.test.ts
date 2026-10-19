import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { describe, expect, it } from "vitest";

import { inspectImage } from "./inspect";
import { crc32, splitApng, splitGif } from "./split";



function solid(width: number, height: number, rgba: [number, number, number, number]): Uint8Array {
  return Uint8Array.from({ length: width * height * 4 }, (_, i) => rgba[i % 4]!);
}

function animatedGif(width: number, height: number, colors: Array<[number, number, number, number]>, delay: number, repeat = 0): Uint8Array {
  const encoder = GIFEncoder();

  for (const color of colors) {
    const rgba = solid(width, height, color);
    const palette = quantize(rgba, 4, { format: "rgba4444", oneBitAlpha: true });

    encoder.writeFrame(applyPalette(rgba, palette, "rgba4444"), width, height, { palette, delay, dispose: 2, repeat });
  }

  encoder.finish();

  return encoder.bytes();
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF];
}

function chunk(type: string, data: number[]): number[] {
  const body = [...type].map(char => char.charCodeAt(0)).concat(data);

  return [...u32(data.length), ...body, ...u32(crc32(Uint8Array.from(body)))];
}

function frameControl(sequence: number, width: number, height: number, x: number, y: number, dispose: number, blend: number): number[] {
  return chunk("fcTL", [...u32(sequence), ...u32(width), ...u32(height), ...u32(x), ...u32(y), 0, 5, 0, 100, dispose, blend]);
}

describe("crc32", () => {
  it("matches PNG's checksum", () => {
    expect(crc32(Uint8Array.from("IEND", char => char.charCodeAt(0)))).toBe(0xAE426082);
  });
});

describe("splitGif", () => {
  it("makes one still GIF per frame, with its delay and disposal", () => {
    const split = splitGif(animatedGif(64, 32, [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]], 120));

    expect(split).toMatchObject({ mime: "image/gif", width: 64, height: 32, repeat: 0 });
    expect(split!.frames).toHaveLength(3);

    for (const frame of split!.frames) {
      const tableSize = frame.bytes[10]! & 0x80 ? 3 * (1 << ((frame.bytes[10]! & 0x07) + 1)) : 0;
      const control = 13 + tableSize;

      expect(frame).toMatchObject({ x: 0, y: 0, width: 64, height: 32, delay: 120, dispose: "background", blend: "over" });
      expect(inspectImage(frame.bytes)).toEqual({ format: "gif", mime: "image/gif", width: 64, height: 32, animated: false });
      // The still keeps the control block but drops its disposal, which the compositing applies.
      expect([frame.bytes[control], frame.bytes[control + 1]]).toEqual([0x21, 0xF9]);
      expect((frame.bytes[control + 3]! >>> 2) & 0x07).toBe(0);
    }
  });

  it("keeps where a smaller frame sits on the canvas", () => {
    const bytes = Uint8Array.from([
      ..."GIF89a".split("").map(char => char.charCodeAt(0)),
      100,
      0,
      50,
      0,
      0x80,
      0,
      0,
      0,
      0,
      0,
      255,
      255,
      255,
      0x21,
      0xF9,
      0x04,
      0x0D,
      0x05,
      0x00,
      0x01,
      0x00,
      0x2C,
      10,
      0,
      20,
      0,
      30,
      0,
      15,
      0,
      0x00,
      0x02,
      0x02,
      0x44,
      0x01,
      0x00,
      0x3B,
    ]);
    const split = splitGif(bytes);

    expect(split!.frames).toEqual([expect.objectContaining({ x: 10, y: 20, width: 30, height: 15, delay: 50, dispose: "previous" })]);
    expect(inspectImage(split!.frames[0]!.bytes)).toMatchObject({ width: 30, height: 15 });
  });

  it("reads how often the animation loops", () => {
    expect(splitGif(animatedGif(8, 8, [[0, 0, 0, 255], [255, 255, 255, 255]], 50, 3))?.repeat).toBe(3);
    // Without a Netscape extension, a GIF plays once.
    expect(splitGif(animatedGif(8, 8, [[0, 0, 0, 255], [255, 255, 255, 255]], 50, -1))?.repeat).toBe(-1);
  });

  it("plays what it could read of a damaged file, as a browser does", () => {
    const bytes = animatedGif(8, 8, [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]], 50);

    expect(splitGif(bytes.subarray(0, bytes.length - 6))?.frames).toHaveLength(2);
    expect(splitGif(Uint8Array.from([...bytes.subarray(0, bytes.length - 1), 0x99, 0x3B]))?.frames).toHaveLength(3);
  });

  it("refuses what is not a GIF, or has no readable frame", () => {
    expect(splitGif(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(splitGif(animatedGif(8, 8, [[0, 0, 0, 255]], 0).subarray(0, 40))).toBeNull();
  });
});

describe("splitApng", () => {
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  const header = chunk("IHDR", [...u32(40), ...u32(20), 8, 6, 0, 0, 0]);

  it("makes one still PNG per frame, with the frame's size, data and timing", () => {
    const bytes = Uint8Array.from([
      ...signature,
      ...header,
      ...chunk("acTL", [...u32(2), ...u32(0)]),
      ...chunk("gAMA", [0, 0, 0xB1, 0x8F]),
      ...frameControl(0, 40, 20, 0, 0, 2, 0),
      ...chunk("IDAT", [1, 2, 3]),
      ...frameControl(1, 10, 5, 4, 6, 1, 1),
      ...chunk("fdAT", [...u32(2), 7, 8]),
      ...chunk("IEND", []),
    ]);
    const split = splitApng(bytes);

    expect(split).toMatchObject({ mime: "image/png", width: 40, height: 20, repeat: 0 });
    expect(split!.frames.map(({ bytes: _, ...frame }) => frame)).toEqual([
      { x: 0, y: 0, width: 40, height: 20, delay: 50, dispose: "background", blend: "source" },
      { x: 4, y: 6, width: 10, height: 5, delay: 50, dispose: "background", blend: "over" },
    ]);

    const second = split!.frames[1]!.bytes;

    expect(inspectImage(second)).toEqual({ format: "png", mime: "image/png", width: 10, height: 5, animated: false });
    expect([...second]).toEqual([
      ...signature,
      ...chunk("IHDR", [...u32(10), ...u32(5), 8, 6, 0, 0, 0]),
      ...chunk("gAMA", [0, 0, 0xB1, 0x8F]),
      ...chunk("IDAT", [7, 8]),
      ...chunk("IEND", []),
    ]);
  });

  it("leaves out a default image the animation does not include", () => {
    const bytes = Uint8Array.from([
      ...signature,
      ...header,
      ...chunk("acTL", [...u32(1), ...u32(0)]),
      ...chunk("IDAT", [1]),
      ...frameControl(0, 40, 20, 0, 0, 0, 0),
      ...chunk("fdAT", [...u32(1), 9]),
      ...chunk("IEND", []),
    ]);

    expect(splitApng(bytes)!.frames).toHaveLength(1);
    expect([...splitApng(bytes)!.frames[0]!.bytes]).toEqual([
      ...signature,
      ...header,
      ...chunk("IDAT", [9]),
      ...chunk("IEND", []),
    ]);
  });

  it("reads how often the animation plays", () => {
    const plays = (count: number) => splitApng(Uint8Array.from([
      ...signature,
      ...header,
      ...chunk("acTL", [...u32(1), ...u32(count)]),
      ...frameControl(0, 40, 20, 0, 0, 0, 0),
      ...chunk("IDAT", [1]),
      ...chunk("IEND", []),
    ]))?.repeat;

    expect([plays(0), plays(1), plays(3)]).toEqual([0, -1, 2]);
  });

  it("refuses what is not a PNG", () => {
    expect(splitApng(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull();
  });
});
