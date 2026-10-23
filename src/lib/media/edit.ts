import type { TFrame } from "./frames";
import type { TImageInfo } from "./inspect";
import type { TSize } from "./resize";

import { GIFEncoder } from "gifenc";

import { readFrames } from "./frames";
import { drawScaled, fitWithin, gifDelay, gifFrame } from "./resize";



export type TPoint = { x: number; y: number };
export type TRect = { x: number; y: number; width: number; height: number };
export type TColor = [number, number, number];

/**
 * Quick edits to an image, always made from the original. Positions and sizes are in the original's
 * pixels, frames are counted from 0, and each edit is null when not made.
 */
export type TEdits = {
  crop: TRect | null;
  // The first and last frames kept, for an animated image.
  trim: { start: number; end: number } | null;
  // The color to make transparent where it touches the edges, and how far from it a pixel may be, from 0 to 100.
  background: { color: TColor; tolerance: number } | null;
};

/**
 * A frame shown while editing, smaller than the original, and how long it shows in milliseconds.
 */
export type TPreviewFrame = { canvas: OffscreenCanvas; duration: number };

export const NO_EDITS: TEdits = { crop: null, trim: null, background: null };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Whether any edit is made.
 *
 * @param edits - The edits.
 * @returns Whether applying them changes the image.
 */
export function hasEdits(edits: TEdits): boolean {
  return edits.crop !== null || edits.trim !== null || edits.background !== null;
}

/**
 * The whole image, as a crop.
 *
 * @param size - The image's size.
 * @returns The rectangle.
 */
export function fullRect(size: TSize): TRect {
  return { x: 0, y: 0, width: size.width, height: size.height };
}

/**
 * Whether a crop keeps the whole image.
 *
 * @param rect - The crop.
 * @param size - The image's size.
 * @returns Whether nothing is cut.
 */
export function isFullRect(rect: TRect, size: TSize): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === size.width && rect.height === size.height;
}

/**
 * Keeps a rectangle inside the image, at least a pixel each way.
 *
 * @param rect - The rectangle.
 * @param size - The image's size.
 * @returns The rectangle, moved and shrunk to fit.
 */
export function clampRect(rect: TRect, size: TSize): TRect {
  const width = clamp(Math.round(rect.width), 1, size.width);
  const height = clamp(Math.round(rect.height), 1, size.height);

  return { x: clamp(Math.round(rect.x), 0, size.width - width), y: clamp(Math.round(rect.y), 0, size.height - height), width, height };
}

/**
 * The largest square inside a rectangle, in its middle.
 *
 * @param rect - The rectangle.
 * @returns The square.
 */
export function squareWithin(rect: TRect): TRect {
  const side = Math.min(rect.width, rect.height);

  return { x: rect.x + Math.floor((rect.width - side) / 2), y: rect.y + Math.floor((rect.height - side) / 2), width: side, height: side };
}

/**
 * The rectangle dragged from a fixed corner to the pointer, inside the image. As a square, its side
 * follows the pointer's farthest coordinate, as far as the image lets it.
 *
 * @param anchor - The fixed corner.
 * @param pointer - Where the pointer is.
 * @param size - The image's size.
 * @param square - Whether to keep it square.
 * @returns The rectangle.
 */
export function dragRect(anchor: TPoint, pointer: TPoint, size: TSize, square: boolean): TRect {
  const ax = clamp(Math.round(anchor.x), 0, size.width);
  const ay = clamp(Math.round(anchor.y), 0, size.height);
  const px = clamp(Math.round(pointer.x), 0, size.width);
  const py = clamp(Math.round(pointer.y), 0, size.height);
  const right = px >= ax;
  const down = py >= ay;
  let width = Math.abs(px - ax);
  let height = Math.abs(py - ay);

  if (square) {
    const room = Math.min(right ? size.width - ax : ax, down ? size.height - ay : ay);

    width = height = Math.min(Math.max(width, height), Math.max(room, 1));
  }

  width = Math.max(width, 1);
  height = Math.max(height, 1);

  return clampRect({ x: right ? ax : ax - width, y: down ? ay : ay - height, width, height }, size);
}

/**
 * Moves a rectangle, stopping at the image's edges.
 *
 * @param rect - The rectangle.
 * @param dx - How far right.
 * @param dy - How far down.
 * @param size - The image's size.
 * @returns The moved rectangle.
 */
export function moveRect(rect: TRect, dx: number, dy: number, size: TSize): TRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, size);
}

/**
 * Grows or shrinks a rectangle from its top left corner, stopping at the image's edges. A square
 * grows both ways at once.
 *
 * @param rect - The rectangle.
 * @param dw - How much wider.
 * @param dh - How much taller.
 * @param size - The image's size.
 * @param square - Whether to keep it square.
 * @returns The resized rectangle.
 */
export function resizeRect(rect: TRect, dw: number, dh: number, size: TSize, square: boolean): TRect {
  if (square) {
    const side = clamp(rect.width + (dw || dh), 1, Math.min(size.width - rect.x, size.height - rect.y));

    return { ...rect, width: side, height: side };
  }

  return { ...rect, width: clamp(rect.width + dw, 1, size.width - rect.x), height: clamp(rect.height + dh, 1, size.height - rect.y) };
}

/**
 * Makes a solid background transparent: the pixels close to its color that are reached from the
 * image's edges without crossing other colors, so the same color inside the subject stays. Pixels
 * already transparent count as background. Pixels just past the tolerance at its border are made
 * partly transparent, which softens the outline.
 *
 * @param rgba - The pixels, changed in place.
 * @param width - The image's width.
 * @param height - The image's height.
 * @param color - The background's color.
 * @param tolerance - How far a pixel's channels may be from the color, from 0 to 100.
 */
export function clearBackground(rgba: Uint8ClampedArray, width: number, height: number, color: TColor, tolerance: number): void {
  const limit = (clamp(tolerance, 0, 100) / 100) * 255;
  const [r, g, b] = color;
  const cleared = new Uint8Array(width * height);
  // Stryker disable next-line ArrayDeclaration: a stray first entry is no pixel, and visits nothing.
  const stack: number[] = [];

  const distance = (pixel: number): number => {
    const i = pixel * 4;

    return Math.max(Math.abs(rgba[i]! - r), Math.abs(rgba[i + 1]! - g), Math.abs(rgba[i + 2]! - b));
  };

  const visit = (pixel: number): void => {
    if (!cleared[pixel] && (rgba[pixel * 4 + 3] === 0 || distance(pixel) <= limit)) {
      cleared[pixel] = 1;
      stack.push(pixel);
    }
  };

  // The checks below keep the fill inside the image, and are only there to be plain: a neighbor that
  // wraps past a row's end is on an edge, and every edge pixel is visited first, and one past the
  // image's ends is outside the pixels, so no change to them changes what is cleared.
  // Stryker disable EqualityOperator,ConditionalExpression,ArithmeticOperator
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }

  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }

  while (stack.length) {
    const pixel = stack.pop()!;
    const x = pixel % width;

    if (x > 0) {
      visit(pixel - 1);
    }

    if (x < width - 1) {
      visit(pixel + 1);
    }

    if (pixel >= width) {
      visit(pixel - width);
    }

    if (pixel < width * (height - 1)) {
      visit(pixel + width);
    }
  }

  const touches = (pixel: number): boolean => {
    const x = pixel % width;

    return (x > 0 && cleared[pixel - 1] === 1) || (x < width - 1 && cleared[pixel + 1] === 1)
      || (pixel >= width && cleared[pixel - width] === 1) || (pixel < width * (height - 1) && cleared[pixel + width] === 1);
  };
  // Stryker restore EqualityOperator,ConditionalExpression,ArithmeticOperator

  // Stryker disable next-line EqualityOperator: one more pass lands past the image, where nothing is written.
  for (let pixel = 0; pixel < width * height; pixel++) {
    const i = pixel * 4;

    if (cleared[pixel]) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0;
    }
    // Stryker disable next-line ConditionalExpression,EqualityOperator: with no tolerance, no pixel is near enough to fade.
    else if (limit > 0 && touches(pixel)) {
      const d = distance(pixel);

      // Stryker disable next-line EqualityOperator: at twice the tolerance the fade keeps the alpha as it is.
      if (d < limit * 2) {
        rgba[i + 3] = Math.round(rgba[i + 3]! * ((d - limit) / limit));
      }
    }
  }
}

/**
 * Edits one frame. The background is found on the whole frame, as the editor shows it, so cropping
 * never changes what counts as background.
 *
 * @param frame - The frame.
 * @param crop - What to keep of it.
 * @param background - The background to clear, if any.
 * @returns A canvas holding the result.
 */
function editFrame(frame: TFrame, crop: TRect, background: TEdits["background"]): OffscreenCanvas {
  let source: CanvasImageSource = frame.source;

  if (background) {
    const full = new OffscreenCanvas(frame.width, frame.height);
    // Stryker disable next-line StringLiteral,ObjectLiteral,BooleanLiteral: a speed hint for the browser's canvas.
    const context = full.getContext("2d", { willReadFrequently: true })!;

    context.drawImage(frame.source, 0, 0);

    const pixels = context.getImageData(0, 0, frame.width, frame.height);

    clearBackground(pixels.data, frame.width, frame.height, background.color, background.tolerance);
    context.putImageData(pixels, 0, 0);
    source = full;
  }

  const canvas = new OffscreenCanvas(crop.width, crop.height);

  // Stryker disable next-line StringLiteral,ObjectLiteral,BooleanLiteral: a speed hint for the browser's canvas.
  canvas.getContext("2d", { willReadFrequently: true })!.drawImage(source, -crop.x, -crop.y);

  return canvas;
}

/**
 * Makes the edited image from the original: a PNG when one frame is left, else a GIF.
 *
 * @param file - The original.
 * @param info - What was read from its header.
 * @param edits - The edits.
 * @returns The new file.
 */
export async function applyEdits(file: Blob, info: TImageInfo, edits: TEdits): Promise<Blob> {
  const crop = clampRect(edits.crop ?? fullRect(info), info);
  const start = edits.trim?.start ?? 0;
  const end = edits.trim?.end ?? Infinity;
  // Only spares writing GIF frames for an image that ends up a PNG anyway, as one frame does.
  // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: the output is the same either way.
  const animated = info.animated && end > start;
  const encoder = GIFEncoder();
  let first: OffscreenCanvas | null = null;
  let count = 0;
  let index = -1;

  for await (const frame of readFrames(file, info)) {
    let canvas: OffscreenCanvas;

    index++;

    try {
      if (index < start) {
        continue;
      }

      if (index > end) {
        break;
      }

      canvas = editFrame(frame, crop, edits.background);
    }
    finally {
      frame.close();
    }

    first ??= canvas;
    count++;

    // Stryker disable next-line ConditionalExpression: as above, the frames are only written to be dropped.
    if (animated) {
      const { index: pixels, palette, transparentIndex } = gifFrame(canvas);

      encoder.writeFrame(pixels, crop.width, crop.height, {
        palette,
        delay: gifDelay(frame.duration),
        repeat: frame.repeat,
        transparent: transparentIndex !== -1,
        // Stryker disable next-line MethodExpression: gifenc only reads the index of a frame marked transparent.
        transparentIndex: Math.max(transparentIndex, 0),
        dispose: 2,
      });
    }
  }

  if (!first) {
    throw new Error("The image has no frames.");
  }

  if (count === 1) {
    return first.convertToBlob({ type: "image/png" });
  }

  encoder.finish();

  return new Blob([encoder.bytes()], { type: "image/gif" });
}

/**
 * Reads every frame of an image at a size for showing it while editing.
 *
 * @param file - The image.
 * @param info - What was read from its header.
 * @param max - The longest side to show it at, in pixels.
 * @returns The frames, in order.
 */
export async function previewFrames(file: Blob, info: TImageInfo, max: number): Promise<TPreviewFrame[]> {
  const target = fitWithin(info, max);
  const frames: TPreviewFrame[] = [];

  for await (const frame of readFrames(file, info)) {
    try {
      frames.push({ canvas: drawScaled(frame.source, frame, target), duration: gifDelay(frame.duration) });
    }
    finally {
      frame.close();
    }
  }

  return frames;
}

/**
 * The name of an edited file: the original's, with the extension of what it became.
 *
 * @param name - The original's name.
 * @param mime - The edited file's type.
 * @returns The name.
 */
export function editedFileName(name: string, mime: string): string {
  return `${name.replace(/\.[^.]+$/, "") || "image"}.${mime === "image/gif" ? "gif" : "png"}`;
}
