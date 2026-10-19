import type { TSplitFrame, TSplitImage } from "./split";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compositedFrames, gifRepeat } from "./frames";



type TStill = { kind: "still"; id: number; closed: boolean };
type TSnapshot = { kind: "snapshot"; ops: string[] };

/**
 * A canvas that records what is drawn on it, as a list of operations, so compositing can be checked
 * without decoding images.
 */
class RecordingCanvas {
  ops: string[] = [];

  constructor(readonly width: number, readonly height: number) {}

  getContext(): object {
    return {
      clearRect: (x: number, y: number, width: number, height: number) => this.ops.push(`clear ${x},${y} ${width}x${height}`),
      drawImage: (image: TStill, x: number, y: number) => this.ops.push(`draw #${image.id} at ${x},${y}`),
      getImageData: () => ({ saved: [...this.ops] }),
      putImageData: (data: { saved: string[] }) => {
        this.ops = [...data.saved];
      },
    };
  }
}

function frame(id: number, overrides: Partial<TSplitFrame>): TSplitFrame {
  return { bytes: Uint8Array.of(id), x: 0, y: 0, width: 10, height: 10, delay: 100, dispose: "none", blend: "over", ...overrides };
}

async function play(split: TSplitImage): Promise<{ frames: string[][]; stills: TStill[] }> {
  const stills: TStill[] = [];

  vi.stubGlobal("OffscreenCanvas", RecordingCanvas);
  vi.stubGlobal("createImageBitmap", async (source: Blob | RecordingCanvas): Promise<TStill | TSnapshot> => {
    if (source instanceof RecordingCanvas) {
      return { kind: "snapshot", ops: [...source.ops] };
    }

    const still = { kind: "still" as const, id: new Uint8Array(await source.arrayBuffer())[0]!, closed: false };

    stills.push(still);

    return Object.assign(still, { close: () => (still.closed = true) });
  });

  const frames: string[][] = [];

  for await (const complete of compositedFrames(split)) {
    frames.push((complete.source as unknown as TSnapshot).ops);
  }

  return { frames, stills };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compositedFrames", () => {
  it("draws each frame at its place over what came before", async () => {
    const { frames, stills } = await play({ mime: "image/gif", width: 40, height: 20, repeat: 0, frames: [frame(1, {}), frame(2, { x: 5, y: 6 })] });

    expect(frames).toEqual([
      ["draw #1 at 0,0"],
      ["draw #1 at 0,0", "draw #2 at 5,6"],
    ]);
    expect(stills.every(still => still.closed)).toBe(true);
  });

  it("clears a frame's area after it shows when it is disposed to the background", async () => {
    const { frames } = await play({ mime: "image/gif", width: 40, height: 20, repeat: 0, frames: [frame(1, { x: 2, y: 3, dispose: "background" }), frame(2, {})] });

    expect(frames[1]).toEqual(["draw #1 at 2,3", "clear 2,3 10x10", "draw #2 at 0,0"]);
  });

  it("puts back what was there before a frame disposed to the previous image", async () => {
    const { frames } = await play({ mime: "image/png", width: 40, height: 20, repeat: 0, frames: [frame(1, {}), frame(2, { dispose: "previous" }), frame(3, {})] });

    expect(frames).toEqual([
      ["draw #1 at 0,0"],
      ["draw #1 at 0,0", "draw #2 at 0,0"],
      ["draw #1 at 0,0", "draw #3 at 0,0"],
    ]);
  });

  it("replaces a frame's area instead of drawing over it when it blends as source", async () => {
    const { frames } = await play({ mime: "image/png", width: 40, height: 20, repeat: 0, frames: [frame(1, {}), frame(2, { x: 1, y: 1, blend: "source" })] });

    expect(frames[1]).toEqual(["draw #1 at 0,0", "clear 1,1 10x10", "draw #2 at 1,1"]);
  });
});

describe("gifRepeat", () => {
  it("turns a decoder's repetition count into a GIF loop count", () => {
    expect(gifRepeat(Infinity)).toBe(0);
    expect(gifRepeat(0)).toBe(-1);
    expect(gifRepeat(2)).toBe(2);
  });
});
