import type { TGifFrame } from "./gif";

import { afterEach, describe, expect, it, vi } from "vitest";

import { startGifEncoder } from "./encoder";
import { inspectImage } from "./inspect";



/**
 * A worker that says it is ready, then lets the test answer for it.
 */
class FakeWorker {
  static last: FakeWorker | null = null;
  static fail = false;
  static noiseFirst = false;

  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string; preventDefault: () => void }) => void) | null = null;
  posted: { type: string }[] = [];
  terminated = false;

  constructor() {
    if (FakeWorker.fail) {
      throw new Error("No workers here.");
    }

    FakeWorker.last = this;

    if (FakeWorker.noiseFirst) {
      queueMicrotask(() => this.reply({ type: "noise" }));
    }

    queueMicrotask(() => this.reply({ type: "ready" }));
  }

  postMessage(message: { type: string }): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(data: unknown): void {
    this.onmessage?.({ data });
  }
}

const frame = (): TGifFrame => ({ data: new Uint8ClampedArray(Array.from({ length: 4 * 4 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 200))), width: 4, height: 4, delay: 70 });

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve));
}

function useWorker(): void {
  FakeWorker.last = null;
  FakeWorker.fail = false;
  FakeWorker.noiseFirst = false;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("location", { origin: new URL(browser.runtime.getURL("/gif-worker.js")).origin });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the page encoder", () => {
  it("writes the GIF itself where no worker can start, counting the frames", async () => {
    useWorker();
    FakeWorker.fail = true;

    const written: number[] = [];
    const encoder = await startGifEncoder(count => written.push(count));

    await encoder.add(frame());
    await encoder.add(frame());

    const file = await encoder.finish();

    encoder.close();
    expect(written).toEqual([1, 2]);
    expect(file.type).toBe("image/gif");
    expect(inspectImage(new Uint8Array(await file.arrayBuffer()))).toMatchObject({ format: "gif", width: 4, height: 4, animated: true });
  });
});

describe("the worker encoder", () => {
  it("hands frames to the worker, passing their pixels along, and gives back the file it makes", async () => {
    useWorker();

    const written: number[] = [];
    const encoder = await startGifEncoder(count => written.push(count));
    const worker = FakeWorker.last!;
    const bytes = new Uint8Array([71, 73, 70]);

    await encoder.add(frame());
    worker.reply({ type: "written", count: 1 });

    const finished = encoder.finish();

    worker.reply({ type: "done", bytes });

    const file = await finished;

    expect(worker.posted.map(message => message.type)).toEqual(["frame", "finish"]);
    expect(written).toEqual([1]);
    expect(file.type).toBe("image/gif");
    expect(file.size).toBe(3);

    encoder.close();
    expect(worker.terminated).toBe(true);
  });

  it("holds back frames while the worker is behind, and goes on as it catches up", async () => {
    useWorker();

    const encoder = await startGifEncoder(() => undefined);
    const worker = FakeWorker.last!;
    let accepted = 0;

    const adding = (async () => {
      for (let i = 0; i < 6; i++) {
        await encoder.add(frame());
        accepted++;
      }
    })();

    await flush();
    // Four may wait on the worker; the fifth does not go until one is written.
    expect(accepted).toBe(4);
    expect(worker.posted).toHaveLength(4);

    worker.reply({ type: "written", count: 1 });
    await flush();
    expect(accepted).toBe(5);

    worker.reply({ type: "written", count: 2 });
    await adding;
    expect(accepted).toBe(6);
    expect(worker.posted).toHaveLength(6);
  });

  it("fails what is waiting, and what comes after, once the worker says it failed", async () => {
    useWorker();

    const encoder = await startGifEncoder(() => undefined);
    const worker = FakeWorker.last!;

    for (let i = 0; i < 4; i++) {
      await encoder.add(frame());
    }

    const blocked = encoder.add(frame());
    const finished = encoder.finish();

    worker.reply({ type: "failed", message: "Out of memory." });

    await expect(blocked).rejects.toThrow("Out of memory.");
    await expect(finished).rejects.toThrow("Out of memory.");
    await expect(encoder.add(frame())).rejects.toThrow("Out of memory.");
    await expect(encoder.finish()).rejects.toThrow("Out of memory.");
  });

  it("fails with the worker's own error", async () => {
    useWorker();

    const encoder = await startGifEncoder(() => undefined);
    const finished = encoder.finish();
    let prevented = false;

    FakeWorker.last!.onerror?.({ message: "Script error.", preventDefault: () => (prevented = true) });

    await expect(finished).rejects.toThrow("Script error.");
    expect(prevented).toBe(true);
  });

  it("falls back to the page when the worker errors before it is ready", async () => {
    useWorker();

    let stopped = false;

    vi.stubGlobal("Worker", class {
      onmessage: unknown = null;
      onerror: ((event: { message: string; preventDefault: () => void }) => void) | null = null;

      constructor() {
        queueMicrotask(() => this.onerror?.({ message: "Blocked.", preventDefault: () => undefined }));
      }

      terminate(): void {
        stopped = true;
      }
    });

    const encoder = await startGifEncoder(() => undefined);

    await encoder.add(frame());

    const file = await encoder.finish();

    expect(stopped).toBe(true);
    expect(inspectImage(new Uint8Array(await file.arrayBuffer()))).toMatchObject({ format: "gif", width: 4, height: 4 });
  });

  it("ignores what the worker says that it does not know, and waits for it to be ready", async () => {
    useWorker();
    // Something else first: the page is still waiting for "ready".
    FakeWorker.noiseFirst = true;

    const encoder = await startGifEncoder(() => undefined);

    // Said again once started, it is not taken for anything.
    FakeWorker.last!.reply({ type: "ready" });
    await encoder.add(frame());
    expect(FakeWorker.last!.posted).toHaveLength(1);
  });

  it("starts the worker from a copy of its script where the page is not the extension's", async () => {
    useWorker();
    vi.stubGlobal("location", { origin: "https://discord.com" });

    const sources: string[] = [];
    const revoked: string[] = [];

    vi.stubGlobal("fetch", vi.fn(async () => ({ text: async () => "postMessage('ready')" })));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:copy");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(url => void revoked.push(url));
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor(source: string) {
        super();
        sources.push(source);
      }
    });

    const encoder = await startGifEncoder(() => undefined);

    expect(sources).toEqual(["blob:copy"]);
    expect(revoked).toEqual(["blob:copy"]);
    encoder.close();
  });
});
