import type { TImageInfo } from "./inspect";

import { applyPalette, GIFEncoder, quantize } from "gifenc";

import { readFrames } from "./frames";



export type TSize = { width: number; height: number };

/**
 * Browsers play frames of 10 ms or less at a tenth of a second, so such delays, or none, get that.
 */
const MIN_DELAY = 10;
const DEFAULT_DELAY = 100;

/**
 * GIF transparency is all or nothing: pixels at least this opaque are kept, the rest are dropped.
 */
const ALPHA_THRESHOLD = 128;

/**
 * The size that fits within a square, keeping the aspect ratio and never enlarging.
 *
 * @param size - The image's size.
 * @param max - The square's side.
 * @returns The fitted size, at least 1 px each way.
 */
export function fitWithin(size: TSize, max: number): TSize {
  const scale = Math.min(1, max / Math.max(size.width, size.height));

  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

/**
 * Draws an image smaller, halving in steps before the last one, which keeps detail a single big
 * reduction would alias away.
 *
 * @param source - The image.
 * @param from - Its size.
 * @param to - The size to draw it at.
 * @returns A canvas holding the result.
 */
function drawScaled(source: CanvasImageSource, from: TSize, to: TSize): OffscreenCanvas {
  let current: CanvasImageSource = source;
  let size = from;

  while (size.width / 2 >= to.width && size.height / 2 >= to.height) {
    const half = { width: Math.round(size.width / 2), height: Math.round(size.height / 2) };
    const step = new OffscreenCanvas(half.width, half.height);
    const context = step.getContext("2d")!;

    context.imageSmoothingQuality = "high";
    context.drawImage(current, 0, 0, half.width, half.height);
    current = step;
    size = half;
  }

  const canvas = new OffscreenCanvas(to.width, to.height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;

  context.imageSmoothingQuality = "high";
  context.drawImage(current, 0, 0, to.width, to.height);

  return canvas;
}

function gifFrame(canvas: OffscreenCanvas): { index: Uint8Array; palette: number[][]; transparentIndex: number } {
  const rgba = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;

  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < ALPHA_THRESHOLD) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0;
    }
    else {
      rgba[i + 3] = 255;
    }
  }

  const palette = quantize(rgba, 256, { format: "rgba4444", oneBitAlpha: true });

  return { index: applyPalette(rgba, palette, "rgba4444"), palette, transparentIndex: palette.findIndex(color => color[3] === 0) };
}

/**
 * Makes a smaller copy of an image to send: a PNG for a still image, a GIF for an animated one.
 * An image already within the size comes back as it is.
 *
 * @param file - The image.
 * @param info - What was read from its header.
 * @param max - The longest side allowed, in pixels.
 * @returns The copy, or the file itself.
 */
export async function resizeImage(file: Blob, info: TImageInfo, max: number): Promise<Blob> {
  const target = fitWithin(info, max);

  if (target.width === info.width && target.height === info.height) {
    return file;
  }

  const encoder = GIFEncoder();
  let first: OffscreenCanvas | null = null;
  let count = 0;

  for await (const frame of readFrames(file, info)) {
    let canvas: OffscreenCanvas;

    try {
      canvas = drawScaled(frame.source, frame, target);
    }
    finally {
      frame.close();
    }

    first ??= canvas;
    count++;

    if (info.animated) {
      const { index, palette, transparentIndex } = gifFrame(canvas);

      // Every frame is complete, so each one replaces the last instead of drawing over it.
      encoder.writeFrame(index, target.width, target.height, {
        palette,
        delay: frame.duration > MIN_DELAY ? frame.duration : DEFAULT_DELAY,
        repeat: frame.repeat,
        transparent: transparentIndex !== -1,
        transparentIndex: Math.max(transparentIndex, 0),
        dispose: 2,
      });
    }
  }

  if (!first) {
    throw new Error("The image has no frames.");
  }

  // A single frame, still or the only one the browser could read, is better as a PNG.
  if (count === 1) {
    return first.convertToBlob({ type: "image/png" });
  }

  encoder.finish();

  return new Blob([encoder.bytes()], { type: "image/gif" });
}

/**
 * Makes a small still of an image, its first frame when animated, for showing in a grid. A still
 * image already within the size comes back as it is.
 *
 * @param file - The image.
 * @param info - What was read from its header.
 * @param max - The longest side allowed, in pixels.
 * @returns The still, a PNG, or the file itself.
 */
export async function stillImage(file: Blob, info: TImageInfo, max: number): Promise<Blob> {
  const target = fitWithin(info, max);

  if (!info.animated && target.width === info.width && target.height === info.height) {
    return file;
  }

  // An animated image decodes to its first frame.
  const bitmap = await createImageBitmap(file);
  let canvas: OffscreenCanvas;

  try {
    canvas = drawScaled(bitmap, info, target);
  }
  finally {
    bitmap.close();
  }

  return canvas.convertToBlob({ type: "image/png" });
}
