import type { TGifFrame, TGifReply } from "./gif";

import { createGifWriter } from "./gif";



/**
 * A GIF being made, a frame at a time.
 */
export type TGifEncoder = {
  // Hands over a frame, its pixels with it; resolves once there is room for the next one.
  add: (frame: TGifFrame) => Promise<void>;
  // Resolves with the file once every frame is written.
  finish: () => Promise<Blob>;
  // Stops, once done or given up.
  close: () => void;
};

/**
 * How many frames can wait for the worker at once, which bounds the memory they hold.
 */
const QUEUE = 4;

/**
 * How long the worker has to start before the page encodes by itself.
 */
const START_TIMEOUT = 5000;

const GIF_WORKER = "/gif-worker.js";



/**
 * Starts the GIF worker, and waits for it to say it is ready. A Discord tab cannot start a worker
 * from the extension's address, so it starts one from a copy of the script.
 *
 * @returns The worker.
 */
async function spawnWorker(): Promise<Worker> {
  const url = browser.runtime.getURL(GIF_WORKER);
  const copy = new URL(url).origin !== location.origin;
  const source = copy ? URL.createObjectURL(new Blob([await (await fetch(url)).text()], { type: "text/javascript" })) : url;
  let worker: Worker | null = null;

  try {
    const started = new Worker(source);

    worker = started;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(reject, START_TIMEOUT, new Error("The GIF worker did not start."));

      started.onmessage = ({ data }: MessageEvent<TGifReply>) => {
        if (data.type === "ready") {
          clearTimeout(timer);
          resolve();
        }
      };

      started.onerror = (event) => {
        event.preventDefault();
        clearTimeout(timer);
        reject(new Error(event.message));
      };
    });

    return started;
  }
  catch (error) {
    worker?.terminate();

    throw error;
  }
  finally {
    if (copy) {
      URL.revokeObjectURL(source);
    }
  }
}

function workerEncoder(worker: Worker, onWritten: (count: number) => void): TGifEncoder {
  let sent = 0;
  let written = 0;
  let failure: Error | null = null;
  let room: (() => void) | null = null;
  let done: { resolve: (file: Blob) => void; reject: (error: Error) => void } | null = null;

  const fail = (error: Error): void => {
    failure ??= error;
    room?.();
    done?.reject(failure);
  };

  worker.onmessage = ({ data }: MessageEvent<TGifReply>) => {
    if (data.type === "written") {
      written = data.count;
      onWritten(written);
      room?.();
    }
    else if (data.type === "done") {
      done?.resolve(new Blob([data.bytes], { type: "image/gif" }));
    }
    else if (data.type === "failed") {
      fail(new Error(data.message));
    }
  };

  worker.onerror = (event) => {
    event.preventDefault();
    fail(new Error(event.message));
  };

  const full = (): boolean => !failure && sent - written >= QUEUE;

  return {
    async add(frame) {
      while (full()) {
        await new Promise<void>(resolve => (room = resolve));
      }

      if (failure) {
        throw failure;
      }

      sent++;
      worker.postMessage({ type: "frame", frame }, [frame.data.buffer]);
    },
    finish() {
      return new Promise((resolve, reject) => {
        if (failure) {
          reject(failure);

          return;
        }

        done = { resolve, reject };
        worker.postMessage({ type: "finish" });
      });
    },
    close() {
      worker.terminate();
    },
  };
}

// Where no worker can start, the page writes the frames itself, letting it draw between them.
function pageEncoder(onWritten: (count: number) => void): TGifEncoder {
  const writer = createGifWriter();
  let count = 0;

  return {
    async add(frame) {
      writer.write(frame);
      onWritten(++count);
      await new Promise(resolve => setTimeout(resolve));
    },
    async finish() {
      return new Blob([writer.finish()], { type: "image/gif" });
    },
    close() {},
  };
}

/**
 * Starts making a GIF in a worker, or on the page where no worker can start.
 *
 * @param onWritten - Told how many frames are written, as they are.
 * @returns The encoder; close it once done.
 */
export async function startGifEncoder(onWritten: (count: number) => void): Promise<TGifEncoder> {
  const worker = await spawnWorker().catch(() => null);

  return worker ? workerEncoder(worker, onWritten) : pageEncoder(onWritten);
}
