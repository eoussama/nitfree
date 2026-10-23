// @vitest-environment happy-dom
import type { TItem } from "~/lib/db";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { resizeImage } from "~/lib/media/resize";
import { sendMessage } from "~/lib/messaging";
import { sendSizes } from "~/lib/settings";

import { attachFile, prepareFile, SendError, UPLOAD_LIMIT } from "./send";



vi.mock("~/lib/messaging", async original => ({ ...await original<object>(), sendMessage: vi.fn() }));
vi.mock("~/lib/media/resize", async original => ({ ...await original<object>(), resizeImage: vi.fn() }));

const send = vi.mocked(sendMessage);
const resize = vi.mocked(resizeImage);

function item(patch: Partial<TItem> = {}): TItem {
  return { id: "a", type: "emoji", title: "wave", description: "", tags: [], packs: [], favorite: false, hash: "h", size: 10, format: "png", mime: "image/png", width: 64, height: 64, animated: false, createdAt: 0, updatedAt: 0, usedAt: null, usageCount: 0, ...patch };
}

/**
 * Answers the background's requests from a table, by name.
 *
 * @param answers - What each request answers.
 */
function answer(answers: Record<string, unknown>): void {
  send.mockImplementation((async (name: string) => {
    const value = answers[name];

    if (value instanceof Error) {
      throw value;
    }

    return value ?? null;
  }) as never);
}

const big = (type = "image/png") => new Blob([new Uint8Array(UPLOAD_LIMIT + 1)], { type });

beforeEach(() => {
  fakeBrowser.reset();
  send.mockReset();
  resize.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("prepareFile", () => {
  it("sends an emoji at the emoji size, reading the copy made before", async () => {
    answer({ "library:variant": new Blob(["small"], { type: "image/png" }) });

    const file = await prepareFile(item());

    expect(file.name).toBe("wave.png");
    expect(await file.text()).toBe("small");
    expect(send).toHaveBeenCalledWith("library:variant", { id: "a", key: "emoji-48" });
    expect(resize).not.toHaveBeenCalled();
  });

  it("makes the sized copy the first time and keeps it, at the size set in the popup", async () => {
    const original = new Blob(["big"], { type: "image/gif" });
    const sized = new Blob(["sized"], { type: "image/gif" });

    await sendSizes.setValue({ emoji: 48, sticker: 200 });
    answer({ "library:file": original });
    resize.mockResolvedValue(sized);

    const file = await prepareFile(item({ type: "sticker", title: "dance" }));

    expect(file.name).toBe("dance.gif");
    expect(resize).toHaveBeenCalledWith(original, expect.objectContaining({ id: "a" }), 200);
    expect(send).toHaveBeenCalledWith("library:storeVariant", { id: "a", key: "sticker-200", file: sized });
  });

  it("keeps nothing when the original is already small enough, or when keeping fails", async () => {
    const original = new Blob(["tiny"], { type: "image/png" });

    answer({ "library:file": original, "library:storeVariant": new Error("Full.") });
    resize.mockResolvedValueOnce(original).mockResolvedValueOnce(new Blob(["x"], { type: "image/png" }));

    expect(await (await prepareFile(item())).text()).toBe("tiny");
    expect(send).not.toHaveBeenCalledWith("library:storeVariant", expect.anything());

    await prepareFile(item());
    expect(send).toHaveBeenCalledWith("library:storeVariant", expect.anything());
  });

  it("sends GIFs and images as they are, refusing one over the upload limit before reading it", async () => {
    answer({ "library:file": new Blob(["gif"], { type: "image/gif" }) });
    expect((await prepareFile(item({ type: "gif", title: "party" }))).name).toBe("party.gif");
    expect(send).not.toHaveBeenCalledWith("library:variant", expect.anything());

    send.mockClear();
    await expect(prepareFile(item({ type: "image", size: UPLOAD_LIMIT + 1 }))).rejects.toThrow("“wave” is over Discord's 10 MB upload limit.");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a file that is still too large once sized, and one that is missing", async () => {
    answer({ "library:file": big() });
    resize.mockResolvedValue(big());
    await expect(prepareFile(item())).rejects.toBeInstanceOf(SendError);

    answer({});
    await expect(prepareFile(item())).rejects.toThrow("The file of “wave” is missing.");
  });
});

describe("attachFile", () => {
  const COMPOSER = `<form id="c">
    <div class="uploadInput_u"><input type="file"></div>
    <div role="textbox" data-slate-editor="true"></div>
    <ul data-list-id="attachments"><li data-list-item-id="attachments___old"></li></ul>
  </form>`;
  const composer = () => document.querySelector("#c")!;
  const file = () => new File(["x"], "wave.png", { type: "image/png" });

  // Plays Discord: a file put on its input shows up in the attachments, as a new one.
  function listOnChange(): void {
    document.querySelector("input")!.addEventListener("change", () => {
      setTimeout(() => document.querySelector("ul")!.insertAdjacentHTML("beforeend", "<li data-list-item-id=\"attachments___new\"></li>"), 5);
    });
  }

  beforeEach(() => {
    document.body.innerHTML = COMPOSER;
  });

  it("puts the file on Discord's upload input, and sends once Discord lists it", async () => {
    const pressed: string[] = [];

    listOnChange();
    document.querySelector("[role=textbox]")!.addEventListener("keydown", event => pressed.push((event as KeyboardEvent).key));

    await attachFile(composer(), file(), { send: true, title: "wave" });

    expect(document.querySelector<HTMLInputElement>("input")!.files?.[0]?.name).toBe("wave.png");
    expect(pressed).toEqual(["Enter"]);
  });

  it("waits through changes to the composer that are not the file", async () => {
    document.querySelector("input")!.addEventListener("change", () => {
      setTimeout(() => document.querySelector("form")!.insertAdjacentHTML("beforeend", "<p>typing</p>"), 2);
      setTimeout(() => document.querySelector("ul")!.insertAdjacentHTML("beforeend", "<li data-list-item-id=\"attachments___late\"></li>"), 10);
    });

    await attachFile(composer(), file(), { send: false, title: "wave" });
  });

  it("only adds the file when not asked to send", async () => {
    const pressed = vi.fn();

    listOnChange();
    document.querySelector("[role=textbox]")!.addEventListener("keydown", pressed);
    await attachFile(composer(), file(), { send: false, title: "wave" });
    expect(pressed).not.toHaveBeenCalled();
  });

  it("goes on at once when the file is listed straight away", async () => {
    document.querySelector("input")!.addEventListener("change", () => {
      document.querySelector("ul")!.insertAdjacentHTML("beforeend", "<li data-list-item-id=\"attachments___now\"></li>");
    });

    await attachFile(composer(), file(), { send: false, title: "wave" });
  });

  it("fails when Discord does not take the file in time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const attaching = attachFile(composer(), file(), { send: true, title: "wave" });
    const failed = expect(attaching).rejects.toThrow("Discord did not take “wave”. Try again.");

    await vi.advanceTimersByTimeAsync(10_000);
    await failed;
  });

  it("fails where there is no upload input or text box to use", async () => {
    document.body.innerHTML = "<form id=\"c\"></form>";
    await expect(attachFile(composer(), file(), { send: true, title: "wave" })).rejects.toThrow("Nitfree could not find the message box to send to.");

    document.body.innerHTML = "<form id=\"c\"><div class=\"uploadInput_u\"><input type=\"file\"></div></form>";
    await expect(attachFile(composer(), file(), { send: true, title: "wave" })).rejects.toBeInstanceOf(SendError);
  });
});
