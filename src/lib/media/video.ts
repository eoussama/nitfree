import type { TSize } from "./resize";

import { startGifEncoder } from "./encoder";
import { frameDelays } from "./gif";
import { drawScaled, fitWithin } from "./resize";



/**
 * The part of a video made into a GIF, in seconds, with the GIF's frame rate and longest side.
 */
export type TClip = { start: number; end: number; rate: number; size: number };

/**
 * The longest and shortest a clip can be, and how long one is to start with, in seconds.
 */
export const MAX_CLIP = 10;
export const MIN_CLIP = 0.5;
export const DEFAULT_CLIP = 3;

export const FRAME_RATES = [10, 15, 20, 25] as const;
export const CLIP_SIZES = [160, 240, 320, 480] as const;

const DEFAULT_RATE = 15;
const DEFAULT_SIZE = 320;



function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The clip a video starts with: its first seconds, at a sticker's size.
 *
 * @param duration - The video's length, in seconds.
 * @returns The clip.
 */
export function defaultClip(duration: number): TClip {
  return { start: 0, end: Math.min(duration, DEFAULT_CLIP), rate: DEFAULT_RATE, size: DEFAULT_SIZE };
}

/**
 * Moves one end of a clip, inside the video. The other end follows when the clip would get shorter
 * than {@link MIN_CLIP} or longer than {@link MAX_CLIP}.
 *
 * @param clip - The clip.
 * @param edge - The end moved.
 * @param time - Where to, in seconds.
 * @param duration - The video's length, in seconds.
 * @returns The clip.
 */
export function moveClip(clip: TClip, edge: "start" | "end", time: number, duration: number): TClip {
  const shortest = Math.min(MIN_CLIP, duration);

  if (edge === "start") {
    const start = clamp(time, 0, duration - shortest);

    return { ...clip, start, end: clamp(clip.end, start + shortest, Math.min(duration, start + MAX_CLIP)) };
  }

  const end = clamp(time, shortest, duration);

  return { ...clip, end, start: clamp(clip.start, Math.max(0, end - MAX_CLIP), end - shortest) };
}

/**
 * When each frame of a clip is taken from the video.
 *
 * @param clip - The clip.
 * @returns The times, in seconds.
 */
export function clipTimes(clip: TClip): number[] {
  const count = Math.max(1, Math.round((clip.end - clip.start) * clip.rate));

  return Array.from({ length: count }, (_, frame) => clip.start + frame / clip.rate);
}

/**
 * The size of a clip's frames: its longest side at the clip's size, never enlarged.
 *
 * @param video - The video's size.
 * @param clip - The clip.
 * @returns The size.
 */
export function clipFrameSize(video: TSize, clip: Pick<TClip, "size">): TSize {
  return fitWithin(video, clip.size);
}

function once(video: HTMLVideoElement, event: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const listening = new AbortController();
    const options = { signal: listening.signal };

    if (signal?.aborted) {
      reject(signal.reason);

      return;
    }

    video.addEventListener(event, () => {
      listening.abort();
      resolve();
    }, options);

    video.addEventListener("error", () => {
      listening.abort();
      reject(new Error(video.error?.message || "The video cannot be played."));
    }, options);

    signal?.addEventListener("abort", () => {
      listening.abort();
      reject(signal.reason);
    }, options);
  });
}

/**
 * Shows a video's frame at a time, once it is drawn.
 *
 * @param video - The video.
 * @param time - When, in seconds.
 * @param signal - Stops waiting.
 * @returns Once the frame shows.
 */
export async function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
  if (video.currentTime === time && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.seeking) {
    return;
  }

  const seeked = once(video, "seeked", signal);

  video.currentTime = time;
  await seeked;
}

/**
 * Loads a video, ready to show its first frame. Videos recorded in a browser often have no length in
 * their header: seeking past their end makes the browser find it.
 *
 * @param video - The element to load it in.
 * @param url - The video's address.
 * @param signal - Stops loading.
 * @returns The video's length, in seconds.
 */
export async function loadVideo(video: HTMLVideoElement, url: string, signal?: AbortSignal): Promise<number> {
  const loaded = once(video, "loadeddata", signal);

  video.muted = true;
  video.preload = "auto";
  video.src = url;
  await loaded;

  if (!Number.isFinite(video.duration)) {
    await seekVideo(video, Number.MAX_SAFE_INTEGER, signal);
  }

  if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
    throw new Error("The video has no picture.");
  }

  await seekVideo(video, 0, signal);

  return video.duration;
}

/**
 * Makes a GIF from a clip of a loaded video: each frame is taken by seeking to it, and written in a
 * worker while the next one is taken.
 *
 * @param video - The video, from {@link loadVideo}.
 * @param clip - The clip.
 * @param onProgress - Told how many frames are written out of how many.
 * @param signal - Stops making it.
 * @returns The GIF.
 */
export async function videoToGif(video: HTMLVideoElement, clip: TClip, onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<Blob> {
  const source = { width: video.videoWidth, height: video.videoHeight };
  const { width, height } = clipFrameSize(source, clip);
  const times = clipTimes(clip);
  const delays = frameDelays(times.length, clip.rate);
  const encoder = await startGifEncoder(count => onProgress(count, times.length));

  try {
    for (const [frame, time] of times.entries()) {
      signal?.throwIfAborted();
      await seekVideo(video, time, signal);

      const data = drawScaled(video, source, { width, height }).getContext("2d")!.getImageData(0, 0, width, height).data;

      await encoder.add({ data, width, height, delay: delays[frame]! });
    }

    signal?.throwIfAborted();

    return await encoder.finish();
  }
  finally {
    encoder.close();
  }
}
