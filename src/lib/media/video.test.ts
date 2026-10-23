import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installCanvas } from "~/test/canvas";
import { asVideo, FakeVideo } from "~/test/video";

import { inspectImage } from "./inspect";
import { splitGif } from "./split";
import { clipFrameSize, clipTimes, defaultClip, loadVideo, MAX_CLIP, MIN_CLIP, moveClip, seekVideo, videoToGif } from "./video";



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


describe("video loading", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a video silently and gives its length, ready at its first frame", async () => {
    const video = new FakeVideo(8);

    expect(await loadVideo(asVideo(video), "blob:video")).toBe(8);
    expect(video.muted).toBe(true);
    expect(video.preload).toBe("auto");
    // Already showing its first frame, it is not seeked there.
    expect(video.seeks).toEqual([]);
  });

  it("finds the length of a video that does not say it by seeking past its end", async () => {
    const video = new FakeVideo(null);

    expect(await loadVideo(asVideo(video), "blob:video")).toBe(12);
    expect(video.seeks[0]).toBeGreaterThan(1e6);
    expect(video.seeks.at(-1)).toBe(0);
  });

  it("refuses a video with no picture", async () => {
    const video = new FakeVideo(5);

    video.videoWidth = 0;

    await expect(loadVideo(asVideo(video), "blob:video")).rejects.toThrow("The video has no picture.");
  });

  it("fails with the browser's reason when the video cannot be played", async () => {
    await expect(loadVideo(asVideo(new FakeVideo(5, false)), "blob:video")).rejects.toThrow("Unsupported.");
  });

  it("says so itself when the browser gives no reason", async () => {
    const video = new FakeVideo(5, false);

    video.failure = null;

    await expect(loadVideo(asVideo(video), "blob:video")).rejects.toThrow("The video cannot be played.");
  });

  it("stops waiting once told to", async () => {
    const controller = new AbortController();
    const loading = loadVideo(asVideo(new FakeVideo(5)), "blob:video", controller.signal);

    controller.abort(new Error("Closed."));
    await expect(loading).rejects.toThrow("Closed.");
    await expect(loadVideo(asVideo(new FakeVideo(5)), "blob:video", controller.signal)).rejects.toThrow("Closed.");
  });
});

describe("seekVideo", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("waits for the frame to be drawn", async () => {
    const video = new FakeVideo(10);

    await seekVideo(asVideo(video), 2.5);
    expect(video.currentTime).toBe(2.5);
    expect(video.seeks).toEqual([2.5]);
  });

  it("does nothing where the video already shows that frame", async () => {
    const video = new FakeVideo(10);

    await seekVideo(asVideo(video), 0);
    expect(video.seeks).toEqual([]);

    video.seeking = true;
    await seekVideo(asVideo(video), 0);
    expect(video.seeks).toEqual([0]);
  });
});

describe("videoToGif", () => {
  const clip = { start: 0, end: 1, rate: 10, size: 160 };

  beforeEach(() => {
    installCanvas();
    vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes a GIF of a frame for each step of the clip, saying how far it has got", async () => {
    const video = new FakeVideo(10);
    const progress: [number, number][] = [];
    const gif = await videoToGif(asVideo(video), clip, (done, total) => progress.push([done, total]));
    const bytes = new Uint8Array(await gif.arrayBuffer());

    expect(video.seeks).toEqual(clipTimes(clip).slice(1));
    expect(progress).toEqual(Array.from({ length: 10 }, (_, i) => [i + 1, 10]));
    expect(inspectImage(bytes)).toMatchObject({ format: "gif", width: 160, height: 90, animated: true });
    expect(splitGif(bytes)!.frames.map(frame => frame.delay)).toEqual(Array.from({ length: 10 }).fill(100));
  });

  it("stops where it is told to, before the first frame or in the middle", async () => {
    const early = new AbortController();

    early.abort(new Error("Cancelled."));
    await expect(videoToGif(asVideo(new FakeVideo(10)), clip, () => undefined, early.signal)).rejects.toThrow("Cancelled.");

    const midway = new AbortController();
    const video = new FakeVideo(10);

    await expect(videoToGif(asVideo(video), clip, (done) => {
      if (done === 3) {
        midway.abort(new Error("Stopped."));
      }
    }, midway.signal)).rejects.toThrow("Stopped.");
  });
});
