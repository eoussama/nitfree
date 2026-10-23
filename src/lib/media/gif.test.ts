import { describe, expect, it } from "vitest";

import { readControls } from "~/test/gif";

import { createGifWriter, frameDelays } from "./gif";
import { inspectImage } from "./inspect";
import { splitGif } from "./split";



function solid(width: number, height: number, rgba: [number, number, number, number]): Uint8ClampedArray {
  return Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => rgba[i % 4]!);
}

describe("frameDelays", () => {
  it("gives every frame the same delay where the rate divides a second's hundredths", () => {
    expect(frameDelays(4, 10)).toEqual([100, 100, 100, 100]);
    expect(frameDelays(3, 25)).toEqual([40, 40, 40]);
  });

  it("alternates delays elsewhere, so the clip keeps its length", () => {
    const delays = frameDelays(45, 15);

    expect(new Set(delays)).toEqual(new Set([60, 70]));
    expect(delays.reduce((total, delay) => total + delay, 0)).toBe(3000);
  });
});

describe("createGifWriter", () => {
  it("writes the frames as a looping animated GIF", () => {
    const writer = createGifWriter();

    writer.write({ data: solid(32, 18, [255, 0, 0, 255]), width: 32, height: 18, delay: 70 });
    writer.write({ data: solid(32, 18, [0, 0, 255, 255]), width: 32, height: 18, delay: 60 });

    const bytes = writer.finish();
    const split = splitGif(bytes);

    expect(inspectImage(bytes)).toEqual({ format: "gif", mime: "image/gif", width: 32, height: 18, animated: true });
    expect(split).toMatchObject({ width: 32, height: 18, repeat: 0 });
    expect(split!.frames.map(frame => frame.delay)).toEqual([70, 60]);
  });

  it("marks a frame's transparent color only where it has see-through pixels, and ends the file", () => {
    const writer = createGifWriter();
    const holes = solid(4, 4, [255, 0, 0, 255]);

    holes.fill(0, 0, 8);
    writer.write({ data: solid(4, 4, [255, 0, 0, 255]), width: 4, height: 4, delay: 70 });
    writer.write({ data: holes, width: 4, height: 4, delay: 70 });

    const bytes = writer.finish();
    const { frames, trailer } = readControls(bytes);

    expect(trailer).toBe(true);
    expect(frames.map(frame => [frame.transparent, frame.dispose])).toEqual([[false, 2], [true, 2]]);
    // With no transparent color, the index says nothing but is still a valid one.
    expect(frames[0]!.index).toBe(0);
  });
});
