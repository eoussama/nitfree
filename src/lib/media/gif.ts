import { GIFEncoder } from "gifenc";

import { gifPixels } from "./resize";



/**
 * One frame to write: its pixels, and how long it shows in milliseconds.
 */
export type TGifFrame = { data: Uint8ClampedArray; width: number; height: number; delay: number };

/**
 * What the GIF worker is sent: frames in order, then the request to finish the file.
 */
export type TGifRequest = { type: "frame"; frame: TGifFrame } | { type: "finish" };

/**
 * What the GIF worker answers: that it started, how many frames it has written, then the file, or why it failed.
 */
export type TGifReply = { type: "ready" } | { type: "written"; count: number } | { type: "done"; bytes: Uint8Array<ArrayBuffer> } | { type: "failed"; message: string };

/**
 * Writes an animated GIF one frame at a time, looping for ever. It needs no canvas, so it runs in a
 * worker as well as on a page.
 *
 * @returns The writer.
 */
export function createGifWriter(): { write: (frame: TGifFrame) => void; finish: () => Uint8Array<ArrayBuffer> } {
  const encoder = GIFEncoder();

  return {
    write({ data, width, height, delay }) {
      const { index, palette, transparentIndex } = gifPixels(data);

      // Every frame is complete, so each one replaces the last instead of drawing over it.
      encoder.writeFrame(index, width, height, {
        palette,
        delay,
        repeat: 0,
        transparent: transparentIndex !== -1,
        transparentIndex: Math.max(transparentIndex, 0),
        dispose: 2,
      });
    },
    finish() {
      encoder.finish();

      return encoder.bytes();
    },
  };
}

/**
 * How long each frame of a clip shows. GIFs count in hundredths of a second, so at rates that do not
 * divide them, such as 15 fps, delays alternate to keep the clip as long as it was.
 *
 * @param count - How many frames.
 * @param rate - The frame rate, in frames per second.
 * @returns Each frame's delay, in milliseconds.
 */
export function frameDelays(count: number, rate: number): number[] {
  const at = (frame: number): number => Math.round((frame * 100) / rate);

  return Array.from({ length: count }, (_, frame) => (at(frame + 1) - at(frame)) * 10);
}
