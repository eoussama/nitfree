import type { TImageInfo } from "./inspect";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canvasOf, fileOf, installCanvas, paintedCanvas, pixelAt } from "~/test/canvas";
import { stubDecoder } from "~/test/decoder";

import { gif } from "~/test/fixtures";
import { inspectImage } from "./inspect";
import { drawScaled, gifDelay, gifFrame, gifPixels, resizeImage, stillImage } from "./resize";
import { splitGif } from "./split";



const still = (size: number): TImageInfo => ({ format: "png", mime: "image/png", width: size, height: size, animated: false });

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

beforeEach(() => {
  installCanvas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gifDelay", () => {
  it("keeps delays browsers play as they are, and gives the rest a tenth of a second", () => {
    expect(gifDelay(70)).toBe(70);
    expect(gifDelay(11)).toBe(11);
    expect(gifDelay(10)).toBe(100);
    expect(gifDelay(0)).toBe(100);
  });
});

describe("gIF frames", () => {
  it("drop the pixels that are too transparent to keep, and say which color is transparent", () => {
    const rgba = Uint8ClampedArray.from([255, 0, 0, 255, 9, 9, 9, 100, 0, 0, 255, 200]);
    const { index, palette, transparentIndex } = gifPixels(rgba);

    expect([...rgba]).toEqual([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255]);
    expect(index).toHaveLength(3);
    expect(palette[transparentIndex]![3]).toBe(0);
    expect(index[1]).toBe(transparentIndex);
  });

  it("have no transparent color where every pixel is kept", () => {
    expect(gifPixels(Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255])).transparentIndex).toBe(-1);
  });

  it("are made from a canvas the same way", () => {
    const canvas = paintedCanvas(2, 1, "#ff0000");

    canvas.getContext().clearRect(1, 0, 1, 1);
    expect(gifFrame(canvas as never).transparentIndex).not.toBe(-1);
  });
});

describe("drawScaled", () => {
  it("draws an image smaller, halving while it can, keeping its colors", () => {
    const small = drawScaled(paintedCanvas(64, 64, "#ff0000") as never, { width: 64, height: 64 }, { width: 8, height: 8 });

    expect([small.width, small.height]).toEqual([8, 8]);
    expect(pixelAt(small as never, 4, 4)).toEqual([255, 0, 0, 255]);
  });

  it("scales by less than half in one step", () => {
    const scaled = drawScaled(paintedCanvas(60, 40, "#00ff00") as never, { width: 60, height: 40 }, { width: 50, height: 30 });

    expect([scaled.width, scaled.height]).toEqual([50, 30]);
    expect(pixelAt(scaled as never, 49, 29)).toEqual([0, 255, 0, 255]);
  });
});

describe("resizeImage", () => {
  it("gives back an image already within the size, as it is", async () => {
    const file = new Blob(["x"]);

    expect(await resizeImage(file, still(32), 48)).toBe(file);
  });

  it("makes a still image a smaller PNG", async () => {
    const result = await resizeImage(await fileOf(paintedCanvas(64, 64, "#ff0000")), still(64), 16);
    const canvas = canvasOf(result)!;

    expect(result.type).toBe("image/png");
    expect([canvas.width, canvas.height]).toEqual([16, 16]);
    expect(pixelAt(canvas, 8, 8)).toEqual([255, 0, 0, 255]);
  });

  it("makes an animated image a smaller GIF of as many frames", async () => {
    const bytes = gif(64, 64, 3);
    const result = await resizeImage(new Blob([bytes]), inspectImage(bytes)!, 32);
    const out = await bytesOf(result);

    expect(result.type).toBe("image/gif");
    expect(inspectImage(out)).toMatchObject({ format: "gif", width: 32, height: 32, animated: true });
    expect(splitGif(out)!.frames).toHaveLength(3);
  });

  it("makes a PNG of an animation of which the browser could read one frame", async () => {
    stubDecoder({ supported: true, track: { frameCount: 1, repetitionCount: 1 }, durations: [100_000] });

    const bytes = gif(64, 64, 2);

    expect((await resizeImage(new Blob([bytes]), inspectImage(bytes)!, 32)).type).toBe("image/png");
  });

  it("fails on an image with no frames", async () => {
    stubDecoder({ supported: true, track: { frameCount: 0, repetitionCount: 1 }, durations: [] });

    const bytes = gif(64, 64, 2);

    await expect(resizeImage(new Blob([bytes]), inspectImage(bytes)!, 32)).rejects.toThrow("The image has no frames.");
  });
});

describe("stillImage", () => {
  it("gives back a still image already within the size, as it is", async () => {
    const file = new Blob(["x"]);

    expect(await stillImage(file, still(32), 48)).toBe(file);
  });

  it("makes a small PNG of an image, or of an animation's first frame, even one within the size", async () => {
    const big = await stillImage(await fileOf(paintedCanvas(64, 64, "#0000ff")), still(64), 16);
    const bytes = gif(32, 32, 2);
    const first = await stillImage(new Blob([bytes]), inspectImage(bytes)!, 48);

    expect(big.type).toBe("image/png");
    expect(pixelAt(canvasOf(big)!, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(first.type).toBe("image/png");
    expect([canvasOf(first)!.width, canvasOf(first)!.height]).toEqual([32, 32]);
  });
});
