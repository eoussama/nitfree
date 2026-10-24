import { describe, expect, it } from "vitest";

import { gif, jpeg, png, webpExtended, webpLossless, webpLossy } from "~/test/fixtures";
import { inspectImage } from "./inspect";



const SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const text = (value: string) => [...value].map(char => char.charCodeAt(0));
const u32 = (value: number) => [(value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF];
const header = (length: number, type: string) => [...u32(length), ...text(type)];
const ihdr = (width: number, height: number) => [...header(13, "IHDR"), ...u32(width), ...u32(height), 8, 6, 0, 0, 0, 0, 0, 0, 0];
const sof = (marker: number, width: number, height: number) => [0xFF, marker, 0x00, 0x11, 0x08, (height >>> 8) & 0xFF, height & 0xFF, (width >>> 8) & 0xFF, width & 0xFF];

describe("inspectImage, at the edges of each format", () => {
  it("reads a PNG no longer than its size, and not a shorter one", () => {
    expect(inspectImage(Uint8Array.from([...SIGNATURE, ...header(13, "IHDR"), ...u32(4), ...u32(3)]))).toMatchObject({ width: 4, height: 3 });
    expect(inspectImage(Uint8Array.from([...SIGNATURE, ...header(13, "IHDR"), ...u32(4)]))).toBeNull();
  });

  it("rejects a PNG whose first chunk is not its header", () => {
    expect(inspectImage(Uint8Array.from([...SIGNATURE, ...header(13, "IHDX"), ...u32(4), ...u32(3), 8, 6, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it("reads a PNG whose chunks run to its end with no image data", () => {
    expect(inspectImage(Uint8Array.from([...SIGNATURE, ...ihdr(4, 3)]))).toMatchObject({ width: 4, height: 3, animated: false });
  });

  it("takes the frame count only from an acTL that is whole, and before the image data", () => {
    const whole = [...header(8, "acTL"), ...u32(2)];

    expect(inspectImage(Uint8Array.from([...SIGNATURE, ...ihdr(4, 3), ...whole]))).toMatchObject({ animated: true });
    expect(inspectImage(Uint8Array.from([...SIGNATURE, ...ihdr(4, 3), ...header(8, "acTL"), 0, 0]))).toMatchObject({ animated: false });
    expect(inspectImage(Uint8Array.from([...SIGNATURE, ...ihdr(4, 3), ...header(1, "IDAT"), 0, 0, 0, 0, 0, ...whole, 0, 0, 0, 0]))).toMatchObject({ animated: false });
  });

  it("skips each image's own color table to count a GIF's frames", () => {
    const image = (colors: number) => [0x2C, 0, 0, 0, 0, 2, 0, 2, 0, 0x80 | colors, ...Array.from<number>({ length: 3 * 2 ** (colors + 1) }).fill(0), 0x02, 0x02, 0x44, 0x01, 0x00];

    expect(inspectImage(Uint8Array.from([...text("GIF89a"), 2, 0, 2, 0, 0, 0, 0, ...image(1), ...image(2), 0x3B]))).toMatchObject({ animated: true });
  });

  it("rejects a WebP too short to have a header, and reads a lossless one as WebP", () => {
    expect(inspectImage(webpLossless(8, 8).subarray(0, 29))).toBeNull();
    expect(inspectImage(webpLossless(8, 8))).toMatchObject({ format: "webp", mime: "image/webp" });
  });

  it("reads a lossy WebP only with its whole start code", () => {
    for (const at of [23, 24, 25]) {
      const broken = webpLossy(8, 8);

      broken[at] = 0;
      expect(inspectImage(broken), String(at)).toBeNull();
    }

    const lossless = webpLossless(8, 8);

    // A lossless header under a lossy name is not read as lossless.
    lossless.set(text("VP8 "), 12);
    expect(inspectImage(lossless)).toBeNull();
  });

  it("does not take a RIFF file that is not a WebP, nor a WebP-looking file that is not RIFF", () => {
    const avi = webpExtended(8, 8, false);
    const notRiff = webpExtended(8, 8, false);

    avi.set(text("AVI "), 8);
    notRiff.set(text("RIFX"), 0);
    expect(inspectImage(avi)).toBeNull();
    expect(inspectImage(notRiff)).toBeNull();
  });

  it("reads a JPEG frame that ends where the file does, and not one cut short", () => {
    expect(inspectImage(Uint8Array.from([0xFF, 0xD8, ...sof(0xC0, 6, 5)]))).toMatchObject({ width: 6, height: 5 });
    expect(inspectImage(Uint8Array.from([0xFF, 0xD8, ...sof(0xC0, 6, 5).slice(0, 7)]))).toBeNull();
  });

  it("rejects a JPEG with something other than a marker where one should be", () => {
    expect(inspectImage(Uint8Array.from([0xFF, 0xD8, 0x00, ...sof(0xC0, 6, 5).slice(1)]))).toBeNull();
  });

  it("passes over JPEG segments that are not frames, and takes every kind of frame", () => {
    const segment = (marker: number) => [0xFF, marker, 0x00, 0x04, 0, 0];

    expect(inspectImage(Uint8Array.from([0xFF, 0xD8, ...segment(0xBF), ...segment(0xC4), ...segment(0xC8), ...segment(0xCC), ...segment(0xD0), ...segment(0xDB), ...sof(0xC2, 6, 5), 0]))).toMatchObject({ width: 6, height: 5 });
    expect(inspectImage(Uint8Array.from([0xFF, 0xD8, ...sof(0xCF, 6, 5), 0]))).toMatchObject({ width: 6, height: 5 });
  });

  it("takes only a file that starts with both bytes of a JPEG's start", () => {
    expect(inspectImage(Uint8Array.from([0xFF, 0x00, ...sof(0xC0, 6, 5), 0]))).toBeNull();
    expect(inspectImage(Uint8Array.from([0x00, 0xD8, ...sof(0xC0, 6, 5), 0]))).toBeNull();
  });
});

describe("inspectImage", () => {
  it("reads still and animated PNGs", () => {
    expect(inspectImage(png(48, 32))).toEqual({ format: "png", mime: "image/png", width: 48, height: 32, animated: false });
    expect(inspectImage(png(160, 160, 12))).toMatchObject({ format: "png", width: 160, height: 160, animated: true });
    expect(inspectImage(png(64, 64, 1))).toMatchObject({ animated: false });
  });

  it("reads GIFs and counts their frames", () => {
    expect(inspectImage(gif(300, 200, 1))).toEqual({ format: "gif", mime: "image/gif", width: 300, height: 200, animated: false });
    expect(inspectImage(gif(300, 200, 3))).toMatchObject({ animated: true });
  });

  it("reads every WebP flavor", () => {
    expect(inspectImage(webpLossy(320, 240))).toEqual({ format: "webp", mime: "image/webp", width: 320, height: 240, animated: false });
    expect(inspectImage(webpLossless(4000, 3))).toMatchObject({ width: 4000, height: 3, animated: false });
    expect(inspectImage(webpExtended(512, 256, true))).toMatchObject({ width: 512, height: 256, animated: true });
    expect(inspectImage(webpExtended(70000, 1, false))).toMatchObject({ width: 70000, height: 1, animated: false });
  });

  it("reads JPEGs past their leading segments", () => {
    expect(inspectImage(jpeg(1920, 1080))).toEqual({ format: "jpeg", mime: "image/jpeg", width: 1920, height: 1080, animated: false });
  });

  it("works on a view into a larger buffer", () => {
    const file = png(10, 20);
    const padded = new Uint8Array(file.length + 8);

    padded.set(file, 8);

    expect(inspectImage(padded.subarray(8))).toMatchObject({ width: 10, height: 20 });
  });

  it("rejects unsupported and truncated files", () => {
    expect(inspectImage(new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"))).toBeNull();
    expect(inspectImage(new Uint8Array())).toBeNull();
    expect(inspectImage(png(10, 10).subarray(0, 20))).toBeNull();
    expect(inspectImage(gif(10, 10, 1).subarray(0, 8))).toBeNull();
    expect(inspectImage(jpeg(10, 10).subarray(0, 12))).toBeNull();
  });

  it("reads a GIF with no global color table", () => {
    const head = [..."GIF89a"].map(char => char.charCodeAt(0));

    expect(inspectImage(Uint8Array.from([...head, 10, 0, 10, 0, 0x00, 0, 0, 0x3B]))).toMatchObject({ format: "gif", width: 10, height: 10, animated: false });
  });

  it("rejects an image with no size", () => {
    expect(inspectImage(png(0, 5))).toBeNull();
    expect(inspectImage(png(5, 0))).toBeNull();
  });

  it("reads a GIF cut short in its second image, as one with a single image", () => {
    expect(inspectImage(gif(10, 10, 2).subarray(0, 30))).toMatchObject({ format: "gif", animated: false });
  });

  it("rejects a WebP that is too short or of a kind it does not know", () => {
    expect(inspectImage(webpLossy(8, 8).subarray(0, 24))).toBeNull();

    const lossless = webpLossless(8, 8);
    const badSignature = lossless.slice();
    const badLossy = webpLossy(8, 8);
    const unknown = webpLossy(8, 8);

    badSignature[20] = 0;
    badLossy[23] = 0;
    unknown.set([...("ABCD")].map(char => char.charCodeAt(0)), 12);

    expect(inspectImage(badSignature)).toBeNull();
    expect(inspectImage(badLossy)).toBeNull();
    expect(inspectImage(unknown)).toBeNull();
  });

  it("reads a JPEG whose segments are padded with fill bytes, and rejects one whose segments are broken", () => {
    const frame = [0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x30, 0x03, 0, 0, 0, 0];

    expect(inspectImage(Uint8Array.from([0xFF, 0xD8, 0xFF, 0xFF, ...frame]))).toMatchObject({ format: "jpeg", width: 48, height: 32 });
    expect(inspectImage(Uint8Array.from([0xFF, 0xD8, 0x00, 0x00, ...frame]))).toBeNull();
  });
});
