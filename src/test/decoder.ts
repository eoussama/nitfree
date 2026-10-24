import { vi } from "vitest";



/**
 * A decoder for a clip of frames: each lasts the given microseconds, or none is said.
 *
 * @param options - What the decoder is like.
 * @param options.supported - Whether the browser can decode the type.
 * @param options.track - The clip's track, or none.
 * @param options.durations - How long each frame lasts, in microseconds.
 * @returns The images decoded, and what the decoder was asked and told.
 */
export function stubDecoder(options: { supported: boolean; track: { frameCount: number; repetitionCount: number } | null; durations: (number | null)[] }) {
  const decoded: { closed: boolean }[] = [];
  const state = { closed: false, requested: [] as number[], init: null as { data: Uint8Array; type: string } | null };

  class FakeDecoder {
    static isTypeSupported = async () => options.supported;
    tracks = { ready: Promise.resolve(), selectedTrack: options.track };
    completed = Promise.resolve();

    /**
     * Notes what it was made to decode.
     *
     * @param init - The file's bytes and type.
     * @param init.data - The bytes.
     * @param init.type - The MIME type.
     */
    constructor(init: { data: Uint8Array; type: string }) {
      state.init = init;
    }

    /**
     * Decodes one frame, a picture of one color.
     *
     * @param request - Which frame.
     * @param request.frameIndex - Its place in the clip.
     * @returns The frame's image.
     */
    async decode({ frameIndex }: { frameIndex: number }) {
      const image = { displayWidth: 8, displayHeight: 6, width: 8, height: 6, solid: [10, 20, 30, 255], duration: options.durations[frameIndex] ?? null, closed: false, close: () => (image.closed = true) };

      state.requested.push(frameIndex);
      decoded.push(image);

      return { image };
    }

    /**
     * Notes that the decoder was closed.
     */
    close(): void {
      state.closed = true;
    }
  }

  vi.stubGlobal("ImageDecoder", FakeDecoder);

  return { decoded, state };
}

