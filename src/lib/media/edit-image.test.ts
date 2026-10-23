import type { TImageInfo } from "./inspect";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canvasOf, fileOf, installCanvas, paintedCanvas, pixelAt } from "~/test/canvas";
import { stubDecoder } from "~/test/decoder";
import { gif } from "~/test/fixtures";

import { readControls } from "~/test/gif";
import { applyEdits, fullRect, NO_EDITS, previewFrames } from "./edit";
import { inspectImage } from "./inspect";
import { splitGif } from "./split";



const still = (width: number, height: number): TImageInfo => ({ format: "png", mime: "image/png", width, height, animated: false });

// A 20 by 20 white image with a red square in its middle.
const framed = () => fileOf(paintedCanvas(20, 20, "#ffffff", { color: "#ff0000", x: 5, y: 5, width: 10, height: 10 }));

async function framesOf(blob: Blob): Promise<number> {
  return splitGif(new Uint8Array(await blob.arrayBuffer()))!.frames.length;
}

beforeEach(() => {
  installCanvas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fullRect", () => {
  it("is the whole image", () => {
    expect(fullRect({ width: 20, height: 10 })).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  });
});

describe("applyEdits of a still image", () => {
  it("makes a PNG of the whole image when nothing is edited", async () => {
    const result = await applyEdits(await framed(), still(20, 20), NO_EDITS);
    const canvas = canvasOf(result)!;

    expect(result.type).toBe("image/png");
    expect([canvas.width, canvas.height]).toEqual([20, 20]);
    expect(pixelAt(canvas, 10, 10)).toEqual([255, 0, 0, 255]);
  });

  it("keeps what the crop keeps", async () => {
    const result = await applyEdits(await framed(), still(20, 20), { ...NO_EDITS, crop: { x: 5, y: 5, width: 10, height: 10 } });
    const canvas = canvasOf(result)!;

    expect([canvas.width, canvas.height]).toEqual([10, 10]);
    expect(pixelAt(canvas, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(canvas, 9, 9)).toEqual([255, 0, 0, 255]);
  });

  it("brings a crop that sticks out back inside the image", async () => {
    const result = await applyEdits(await framed(), still(20, 20), { ...NO_EDITS, crop: { x: 15, y: 15, width: 30, height: 30 } });

    expect([canvasOf(result)!.width, canvasOf(result)!.height]).toEqual([20, 20]);
  });

  it("clears the background around the subject, and only what touches the edges", async () => {
    const result = await applyEdits(await framed(), still(20, 20), { ...NO_EDITS, background: { color: [255, 255, 255], tolerance: 10 } });
    const canvas = canvasOf(result)!;

    expect(pixelAt(canvas, 0, 0)[3]).toBe(0);
    expect(pixelAt(canvas, 19, 19)[3]).toBe(0);
    expect(pixelAt(canvas, 10, 10)).toEqual([255, 0, 0, 255]);
  });

  it("finds the background on the whole image, so cropping does not change what it is", async () => {
    const result = await applyEdits(await framed(), still(20, 20), {
      crop: { x: 3, y: 3, width: 14, height: 14 },
      trim: null,
      background: { color: [255, 255, 255], tolerance: 10 },
    });
    const canvas = canvasOf(result)!;

    expect([canvas.width, canvas.height]).toEqual([14, 14]);
    expect(pixelAt(canvas, 0, 0)[3]).toBe(0);
    expect(pixelAt(canvas, 7, 7)).toEqual([255, 0, 0, 255]);
  });
});

describe("applyEdits of an animated image", () => {
  const bytes = gif(8, 8, 4);
  const info = inspectImage(bytes)!;
  const file = new Blob([bytes]);

  it("makes a GIF of all its frames", async () => {
    const result = await applyEdits(file, info, NO_EDITS);

    expect(result.type).toBe("image/gif");
    expect(await framesOf(result)).toBe(4);
  });

  it("keeps the frames between the first and the last", async () => {
    const result = await applyEdits(file, info, { ...NO_EDITS, trim: { start: 1, end: 2 } });

    expect(await framesOf(result)).toBe(2);
  });

  it("makes a PNG when one frame is left", async () => {
    const result = await applyEdits(file, info, { ...NO_EDITS, trim: { start: 2, end: 2 } });

    expect(result.type).toBe("image/png");
  });

  it("crops every frame", async () => {
    const result = await applyEdits(file, info, { ...NO_EDITS, crop: { x: 0, y: 0, width: 4, height: 6 } });

    expect(inspectImage(new Uint8Array(await result.arrayBuffer()))).toMatchObject({ width: 4, height: 6, animated: true });
  });

  it("marks see-through frames as such, and opaque ones as not, in a finished file", async () => {
    // The frames of this fixture decode to nothing, so every one is see-through.
    const clear = readControls(new Uint8Array(await (await applyEdits(file, info, NO_EDITS)).arrayBuffer()));

    expect(clear.trailer).toBe(true);
    expect(clear.frames.every(frame => frame.transparent)).toBe(true);

    const { decoded } = stubDecoder({ supported: true, track: { frameCount: 3, repetitionCount: 0 }, durations: [70_000, 70_000, 70_000] });
    const opaque = readControls(new Uint8Array(await (await applyEdits(file, info, { ...NO_EDITS, crop: { x: 0, y: 0, width: 8, height: 6 }, trim: { start: 1, end: 2 } })).arrayBuffer()));

    expect(opaque.frames.map(frame => [frame.transparent, frame.index, frame.dispose])).toEqual([[false, 0, 2], [false, 0, 2]]);
    // Every frame read is closed, the ones trimmed away too.
    expect(decoded.map(image => image.closed)).toEqual([true, true, true]);
  });

  it("fails when there is not a single frame to keep", async () => {
    stubDecoder({ supported: true, track: { frameCount: 0, repetitionCount: 1 }, durations: [] });

    await expect(applyEdits(file, info, NO_EDITS)).rejects.toThrow("The image has no frames.");
  });
});

describe("previewFrames", () => {
  it("reads every frame at a size to show while editing, with how long each shows", async () => {
    const bytes = gif(64, 32, 3);
    const frames = await previewFrames(new Blob([bytes]), inspectImage(bytes)!, 16);

    expect(frames).toHaveLength(3);
    expect(frames.map(frame => [frame.canvas.width, frame.canvas.height])).toEqual([[16, 8], [16, 8], [16, 8]]);
    // A frame with no delay of its own shows for the tenth of a second browsers give it.
    expect(frames.every(frame => frame.duration > 0)).toBe(true);
  });

  it("closes every frame it reads", async () => {
    const { decoded } = stubDecoder({ supported: true, track: { frameCount: 2, repetitionCount: 0 }, durations: [70_000, 70_000] });
    const bytes = gif(8, 6, 2);

    await previewFrames(new Blob([bytes]), inspectImage(bytes)!, 16);
    expect(decoded.map(image => image.closed)).toEqual([true, true]);
  });
});
