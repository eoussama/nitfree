import type { TImageInfo } from "./inspect";
import type { TSplitImage } from "./split";

import { splitApng, splitGif } from "./split";



/**
 * One complete frame of an image, ready to draw, and how long it shows in milliseconds.
 */
export type TFrame = {
  source: CanvasImageSource;
  width: number;
  height: number;
  duration: number;
  // How often the animation plays again after the first time: 0 for ever, -1 not at all.
  repeat: number;
  close: () => void;
};

/**
 * ImageDecoder counts repetitions, Infinity for ever; GIF encoders count 0 for ever and -1 for none.
 *
 * @param count - The decoder's repetition count.
 * @returns The GIF repeat count.
 */
export function gifRepeat(count: number): number {
  return count === Infinity ? 0 : count <= 0 ? -1 : count;
}

/**
 * Whether the browser can decode every frame of an image itself.
 *
 * @param mime - The image's MIME type.
 * @returns Whether to use ImageDecoder.
 */
async function canDecodeFrames(mime: string): Promise<boolean> {
  return typeof ImageDecoder !== "undefined" && await ImageDecoder.isTypeSupported(mime);
}

async function* decodedFrames(bytes: Uint8Array<ArrayBuffer>, mime: string): AsyncGenerator<TFrame> {
  const decoder = new ImageDecoder({ data: bytes, type: mime });

  try {
    // The whole file is read once completed, but its tracks are only listed once ready.
    await decoder.tracks.ready;
    await decoder.completed;

    const count = decoder.tracks.selectedTrack?.frameCount ?? 1;
    const repeat = gifRepeat(decoder.tracks.selectedTrack?.repetitionCount ?? Infinity);

    for (let index = 0; index < count; index++) {
      const { image } = await decoder.decode({ frameIndex: index });

      yield {
        source: image,
        width: image.displayWidth,
        height: image.displayHeight,
        duration: (image.duration ?? 0) / 1000,
        repeat,
        close: () => image.close(),
      };
    }
  }
  finally {
    decoder.close();
  }
}

/**
 * Plays split frames onto a canvas the size of the image, as a browser would, and hands out each
 * complete frame.
 *
 * @param split - The image's frames as still files.
 * @returns Each complete frame, as it is made.
 */
export async function* compositedFrames(split: TSplitImage): AsyncGenerator<TFrame> {
  const canvas = new OffscreenCanvas(split.width, split.height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;

  for (const frame of split.frames) {
    const before = frame.dispose === "previous" ? context.getImageData(0, 0, split.width, split.height) : null;
    const still = await createImageBitmap(new Blob([frame.bytes], { type: split.mime }));

    try {
      if (frame.blend === "source") {
        context.clearRect(frame.x, frame.y, frame.width, frame.height);
      }

      context.drawImage(still, frame.x, frame.y);
    }
    finally {
      still.close();
    }

    const complete = await createImageBitmap(canvas);

    yield { source: complete, width: split.width, height: split.height, duration: frame.delay, repeat: split.repeat, close: () => complete.close() };

    if (frame.dispose === "background") {
      context.clearRect(frame.x, frame.y, frame.width, frame.height);
    }
    else if (before) {
      context.putImageData(before, 0, 0);
    }
  }
}

async function* stillFrame(file: Blob): AsyncGenerator<TFrame> {
  const bitmap = await createImageBitmap(file);

  yield { source: bitmap, width: bitmap.width, height: bitmap.height, duration: 0, repeat: -1, close: () => bitmap.close() };
}

/**
 * Reads every frame of an image, one at a time so long animations are never all in memory. Where
 * the browser cannot decode frames itself, GIFs and APNGs are split and composited here; an animated
 * WebP then only gives its first frame.
 *
 * @param file - The image.
 * @param info - What was read from its header.
 * @returns Each complete frame, as it is made; the caller closes it once drawn.
 */
export async function* readFrames(file: Blob, info: TImageInfo): AsyncGenerator<TFrame> {
  if (!info.animated) {
    yield* stillFrame(file);

    return;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (await canDecodeFrames(info.mime)) {
    yield* decodedFrames(bytes, info.mime);

    return;
  }

  const split = info.format === "gif" ? splitGif(bytes) : info.format === "png" ? splitApng(bytes) : null;

  yield* split ? compositedFrames(split) : stillFrame(file);
}
