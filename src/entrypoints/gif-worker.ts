import type { TGifReply, TGifRequest } from "~/lib/media/gif";

import { toError } from "@eoussama/core";

import { createGifWriter } from "~/lib/media/gif";



/**
 * Encodes a GIF in a worker, so making one from a video leaves the page free: it is sent the frames
 * one by one and tells how many it has written, then hands back the file. Started by
 * `startGifEncoder`, from the extension's pages and from a copy of this script in Discord's tab.
 */
export default defineUnlistedScript(() => {
  const writer = createGifWriter();
  let count = 0;

  const reply = (message: TGifReply, transfer: Transferable[] = []): void => postMessage(message, { transfer });

  addEventListener("message", ({ data }: MessageEvent<TGifRequest>) => {
    try {
      if (data.type === "frame") {
        writer.write(data.frame);
        reply({ type: "written", count: ++count });
      }
      else {
        const bytes = writer.finish();

        reply({ type: "done", bytes }, [bytes.buffer]);
      }
    }
    catch (error) {
      reply({ type: "failed", message: toError(error).message });
    }
  });

  reply({ type: "ready" });
});
