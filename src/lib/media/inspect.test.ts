import { describe, expect, it } from "vitest";

import { gif, jpeg, png, webpExtended, webpLossless, webpLossy } from "./fixtures";
import { inspectImage } from "./inspect";



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
});
