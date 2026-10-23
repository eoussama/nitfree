import { describe, expect, it } from "vitest";

import { clipFrameSize, clipTimes, defaultClip, MAX_CLIP, MIN_CLIP, moveClip } from "./video";



const CLIP = { start: 2, end: 5, rate: 10, size: 320 };

describe("clips", () => {
  it("start as a video's first seconds, or all of a shorter one", () => {
    expect(defaultClip(60)).toEqual({ start: 0, end: 3, rate: 15, size: 320 });
    expect(defaultClip(1.5).end).toBe(1.5);
  });

  it("move either end inside the video", () => {
    expect(moveClip(CLIP, "start", 1, 60)).toEqual({ ...CLIP, start: 1 });
    expect(moveClip(CLIP, "end", 7, 60)).toEqual({ ...CLIP, end: 7 });
    expect(moveClip(CLIP, "start", -4, 60).start).toBe(0);
    expect(moveClip(CLIP, "end", 99, 6).end).toBe(6);
  });

  it("push the other end along to stay long enough", () => {
    expect(moveClip(CLIP, "start", 5, 60)).toEqual({ ...CLIP, start: 5, end: 5 + MIN_CLIP });
    expect(moveClip(CLIP, "end", 1, 60)).toEqual({ ...CLIP, start: 1 - MIN_CLIP, end: 1 });
    expect(moveClip(CLIP, "start", 60, 60)).toEqual({ ...CLIP, start: 60 - MIN_CLIP, end: 60 });
  });

  it("pull the other end along to stay short enough", () => {
    expect(moveClip(CLIP, "end", 30, 60)).toEqual({ ...CLIP, start: 30 - MAX_CLIP, end: 30 });
    expect(moveClip({ ...CLIP, end: 20 }, "start", 0, 60)).toEqual({ ...CLIP, start: 0, end: MAX_CLIP });
  });

  it("fit a video shorter than the shortest clip", () => {
    expect(moveClip({ ...CLIP, start: 0, end: 0.3 }, "end", 0, 0.3)).toEqual({ ...CLIP, start: 0, end: 0.3 });
  });

  it("take a frame at each step of the frame rate", () => {
    expect(clipTimes({ ...CLIP, end: 2.5 })).toEqual([2, 2.1, 2.2, 2.3, 2.4]);
    expect(clipTimes({ start: 0, end: 3, rate: 15, size: 320 })).toHaveLength(45);
    expect(clipTimes({ ...CLIP, end: 2.01 })).toEqual([2]);
  });

  it("make frames at the clip's size, never larger than the video", () => {
    expect(clipFrameSize({ width: 1920, height: 1080 }, { size: 320 })).toEqual({ width: 320, height: 180 });
    expect(clipFrameSize({ width: 200, height: 300 }, { size: 480 })).toEqual({ width: 200, height: 300 });
  });
});
