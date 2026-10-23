import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installCanvas } from "~/test/canvas";
import { stubDecoder } from "~/test/decoder";

import { gif, png, webpExtended } from "~/test/fixtures";
import { readFrames } from "./frames";
import { inspectImage } from "./inspect";



type TInfo = NonNullable<ReturnType<typeof inspectImage>>;

const info = (bytes: Uint8Array): TInfo => inspectImage(bytes)!;

async function collect(file: Blob, picture: TInfo) {
  const frames: { width: number; height: number; duration: number; repeat: number; close: () => void }[] = [];

  for await (const frame of readFrames(file, picture)) {
    frames.push(frame);
  }

  return frames;
}

beforeEach(() => {
  installCanvas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readFrames", () => {
  it("gives a still image as one frame that shows no time and does not repeat", async () => {
    const bytes = png(12, 9);
    const [only, ...rest] = await collect(new Blob([bytes]), info(bytes));

    expect(rest).toEqual([]);
    expect(only).toMatchObject({ width: 12, height: 9, duration: 0, repeat: -1 });
    only!.close();
  });

  it("has the browser decode each frame of an animation it can, one at a time, closing as it goes", async () => {
    const { decoded, state } = stubDecoder({ supported: true, track: { frameCount: 2, repetitionCount: Number.POSITIVE_INFINITY }, durations: [70_000, null] });
    const bytes = gif(8, 6, 2);
    const frames = await collect(new Blob([bytes]), info(bytes));

    expect(state.requested).toEqual([0, 1]);
    expect(frames).toMatchObject([{ width: 8, height: 6, duration: 70, repeat: 0 }, { duration: 0 }]);
    expect(state.closed).toBe(true);

    frames[0]!.close();
    expect(decoded[0]!.closed).toBe(true);
  });

  it("counts a decoder with no track as one frame that plays for ever", async () => {
    const { state } = stubDecoder({ supported: true, track: null, durations: [] });
    const bytes = gif(8, 6, 2);
    const frames = await collect(new Blob([bytes]), info(bytes));

    expect(state.requested).toEqual([0]);
    expect(frames).toMatchObject([{ repeat: 0 }]);
  });

  it("splits a GIF itself where the browser cannot decode its frames", async () => {
    stubDecoder({ supported: false, track: null, durations: [] });

    const bytes = gif(8, 6, 3);
    const frames = await collect(new Blob([bytes]), info(bytes));

    expect(frames).toHaveLength(3);
    expect(frames.every(frame => frame.width === 8 && frame.height === 6)).toBe(true);
  });

  it("splits an APNG itself, too, and gives only a still of what it has no way to split", async () => {
    vi.stubGlobal("ImageDecoder", undefined);

    const animatedPng = png(8, 6, 2);
    const webp = webpExtended(8, 6, true);

    // This fixture has no frame control chunks, so there is nothing to split and the first image stands in.
    expect(await collect(new Blob([animatedPng]), info(animatedPng))).toHaveLength(1);
    expect(await collect(new Blob([webp]), info(webp))).toHaveLength(1);
  });
});
