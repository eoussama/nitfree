import type { TGifReply } from "~/lib/media/gif";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inspectImage } from "~/lib/media/inspect";

import worker from "../entrypoints/gif-worker";



type TListener = (event: { data: unknown }) => void;

let replies: { message: TGifReply; transfer: Transferable[] }[];
let listener: TListener;

const frame = () => ({ data: new Uint8ClampedArray(4 * 4 * 4).fill(255), width: 4, height: 4, delay: 70 });

beforeEach(() => {
  replies = [];
  vi.stubGlobal("postMessage", (message: TGifReply, options: { transfer: Transferable[] }) => replies.push({ message, transfer: options.transfer }));
  vi.stubGlobal("addEventListener", (type: string, handler: TListener) => {
    if (type === "message") {
      listener = handler;
    }
  });
  worker.main();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the GIF worker", () => {
  it("says it is ready, counts the frames it writes, and hands back the file without copying it", () => {
    expect(replies[0]!.message).toEqual({ type: "ready" });

    listener({ data: { type: "frame", frame: frame() } });
    listener({ data: { type: "frame", frame: frame() } });
    expect(replies.slice(1).map(reply => reply.message)).toEqual([{ type: "written", count: 1 }, { type: "written", count: 2 }]);

    listener({ data: { type: "finish" } });

    const done = replies.at(-1)!;

    expect(done.message.type).toBe("done");
    expect(done.transfer).toHaveLength(1);
    expect(inspectImage((done.message as { bytes: Uint8Array }).bytes)).toMatchObject({ format: "gif", width: 4, height: 4, animated: true });
  });

  it("says why it failed", () => {
    listener({ data: { type: "frame", frame: null } });
    expect(replies.at(-1)!.message).toEqual({ type: "failed", message: expect.any(String) });
  });
});
