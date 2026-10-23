import { vi } from "vitest";

import { inspectImage } from "~/lib/media/inspect";



/**
 * Pixels held in memory, for the parts of the browser that tests run without: an OffscreenCanvas
 * that really draws, scales and reads back, and a createImageBitmap that knows what the canvases it
 * made as files looked like. Enough for the media code to be tested on what it produces.
 */

type TSource = { width: number; height: number; data: Uint8ClampedArray };

/**
 * Anything that can be drawn: a canvas, a bitmap of one, or a stand-in with one color all over.
 */
type TDrawable = FakeCanvas | FakeBitmap | { solid: number[]; videoWidth?: number; videoHeight?: number; width?: number; height?: number };

const made = new WeakMap<Blob, FakeCanvas>();

function parse(color: string): number[] {
  const value = Number.parseInt(color.slice(1), 16);

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

function sourceOf(drawable: TDrawable): TSource {
  if (drawable instanceof FakeCanvas) {
    return drawable;
  }

  if (drawable instanceof FakeBitmap) {
    return drawable.canvas;
  }

  const width = drawable.videoWidth ?? drawable.width ?? 1;
  const height = drawable.videoHeight ?? drawable.height ?? 1;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < data.length; i += 4) {
    data.set(drawable.solid, i);
  }

  return { width, height, data };
}

class FakeContext {
  imageSmoothingQuality = "low";
  fillStyle = "#000000";

  constructor(private readonly canvas: FakeCanvas) {}

  fillRect(x: number, y: number, width: number, height: number): void {
    this.paint(x, y, width, height, parse(this.fillStyle));
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    this.paint(x, y, width, height, [0, 0, 0, 0]);
  }

  /**
   * Draws a drawable at a place, nearest pixel, as large as given or as it is; transparent pixels
   * leave what is under them, opaque ones replace it.
   *
   * @param drawable - What to draw.
   * @param dx - Where, across.
   * @param dy - Where, down.
   * @param dw - How wide to draw it.
   * @param dh - How tall to draw it.
   */
  drawImage(drawable: TDrawable, dx: number, dy: number, dw?: number, dh?: number): void {
    const source = sourceOf(drawable);
    const width = dw ?? source.width;
    const height = dh ?? source.height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tx = Math.round(dx) + x;
        const ty = Math.round(dy) + y;

        if (tx < 0 || ty < 0 || tx >= this.canvas.width || ty >= this.canvas.height) {
          continue;
        }

        const at = (Math.min(Math.floor(y * source.height / height), source.height - 1) * source.width + Math.min(Math.floor(x * source.width / width), source.width - 1)) * 4;
        const alpha = source.data[at + 3]!;

        if (alpha > 0) {
          this.canvas.data.set(source.data.subarray(at, at + 4), (ty * this.canvas.width + tx) * 4);
        }
      }
    }
  }

  getImageData(x: number, y: number, width: number, height: number): TSource {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let row = 0; row < height; row++) {
      const from = ((y + row) * this.canvas.width + x) * 4;

      data.set(this.canvas.data.subarray(from, from + width * 4), row * width * 4);
    }

    return { width, height, data };
  }

  putImageData(image: TSource, x: number, y: number): void {
    for (let row = 0; row < image.height; row++) {
      this.canvas.data.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), ((y + row) * this.canvas.width + x) * 4);
    }
  }

  private paint(x: number, y: number, width: number, height: number, color: number[]): void {
    for (let row = Math.max(y, 0); row < Math.min(y + height, this.canvas.height); row++) {
      for (let column = Math.max(x, 0); column < Math.min(x + width, this.canvas.width); column++) {
        this.canvas.data.set(color, (row * this.canvas.width + column) * 4);
      }
    }
  }
}

/**
 * A canvas that keeps its pixels as red, green, blue and alpha, row after row.
 */
export class FakeCanvas {
  readonly data: Uint8ClampedArray;
  private readonly context = new FakeContext(this);

  /**
   * Makes an empty, transparent canvas.
   *
   * @param width - How wide it is.
   * @param height - How tall it is.
   */
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /**
   * The canvas' only context, whatever kind is asked for.
   *
   * @returns The context.
   */
  getContext(): FakeContext {
    return this.context;
  }

  /**
   * Turns the canvas into a file of the type asked for, which createImageBitmap reads the pixels of
   * again; its bytes are a valid, empty file of the right size, as far as headers go.
   *
   * @param options - The type of file.
   * @param options.type - The MIME type.
   * @returns The file.
   */
  async convertToBlob(options: { type: string }): Promise<Blob> {
    const blob = new Blob([await headerFor(this.width, this.height)], { type: options.type });

    made.set(blob, this);

    return blob;
  }
}

async function headerFor(width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  const { png } = await import("~/lib/media/fixtures");

  return png(width, height);
}

class FakeBitmap {
  readonly canvas: FakeCanvas;
  closed = false;

  constructor(from: TSource) {
    this.canvas = new FakeCanvas(from.width, from.height);
    this.canvas.data.set(from.data);
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  close(): void {
    this.closed = true;
  }
}

async function createImageBitmapFake(source: Blob | TDrawable): Promise<FakeBitmap> {
  if (!(source instanceof Blob)) {
    return new FakeBitmap(sourceOf(source));
  }

  const drawn = made.get(source);

  if (drawn) {
    return new FakeBitmap(drawn);
  }

  const info = inspectImage(new Uint8Array(await source.arrayBuffer()));

  if (!info) {
    throw new DOMException("The source image could not be decoded.", "InvalidStateError");
  }

  return new FakeBitmap({ width: info.width, height: info.height, data: new Uint8ClampedArray(info.width * info.height * 4) });
}

/**
 * Puts the in-memory canvas in place of the browser's, until `vi.unstubAllGlobals()`.
 */
export function installCanvas(): void {
  vi.stubGlobal("OffscreenCanvas", FakeCanvas);
  vi.stubGlobal("createImageBitmap", createImageBitmapFake);
}

/**
 * A canvas filled with one color, with a different one on a rectangle in it.
 *
 * @param width - The canvas' width.
 * @param height - The canvas' height.
 * @param fill - The background color, `#rrggbb`.
 * @param spot - A rectangle to paint in another color.
 * @param spot.color - The rectangle's color, `#rrggbb`.
 * @param spot.x - Where it starts, across.
 * @param spot.y - Where it starts, down.
 * @param spot.width - How wide it is.
 * @param spot.height - How tall it is.
 * @returns The canvas.
 */
export function paintedCanvas(width: number, height: number, fill: string, spot?: { color: string; x: number; y: number; width: number; height: number }): FakeCanvas {
  const canvas = new FakeCanvas(width, height);
  const context = canvas.getContext();

  context.fillStyle = fill;
  context.fillRect(0, 0, width, height);

  if (spot) {
    context.fillStyle = spot.color;
    context.fillRect(spot.x, spot.y, spot.width, spot.height);
  }

  return canvas;
}

/**
 * The file of a painted canvas, as the real thing would have it: bytes of an image the right size,
 * whose pixels the fake `createImageBitmap` finds again.
 *
 * @param canvas - The canvas.
 * @returns The file.
 */
export function fileOf(canvas: FakeCanvas): Promise<Blob> {
  return canvas.convertToBlob({ type: "image/png" });
}

/**
 * The pixel of a canvas, bitmap or file made of one, as red, green, blue and alpha.
 *
 * @param canvas - The canvas.
 * @param x - Across.
 * @param y - Down.
 * @returns The pixel.
 */
export function pixelAt(canvas: TSource, x: number, y: number): number[] {
  const at = (y * canvas.width + x) * 4;

  return [...canvas.data.subarray(at, at + 4)];
}

/**
 * The canvas a file made by `convertToBlob` was made from.
 *
 * @param blob - The file.
 * @returns The canvas, or undefined for a file it did not make.
 */
export function canvasOf(blob: Blob): FakeCanvas | undefined {
  return made.get(blob);
}
