import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { CHANNEL, isEventEnvelope, isReply, isRequestEnvelope } from "./envelope";
import { broadcast, handleMessages, onEvent, sendMessage } from "./index";



beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendMessage", () => {
  it("reaches the handler and gives back what it answers, blobs and all", async () => {
    handleMessages({ "runtime:ping": () => ({ version: "9.9.9" }) });

    expect(await sendMessage("runtime:ping")).toEqual({ version: "9.9.9" });
  });

  it("rejects with the handler's own error", async () => {
    handleMessages({
      "runtime:ping": () => {
        throw new TypeError("It broke.");
      },
    });

    await expect(sendMessage("runtime:ping")).rejects.toMatchObject({ name: "TypeError", message: "It broke." });
  });

  it("rejects when what answers is not a Nitfree reply", async () => {
    fakeBrowser.runtime.onMessage.addListener(() => "something else" as never);

    await expect(sendMessage("runtime:ping")).rejects.toThrow("No handler answered \"runtime:ping\"");
  });
});

describe("handleMessages", () => {
  it("answers nothing to what is not a request, leaving it to other listeners", () => {
    const add = vi.spyOn(fakeBrowser.runtime.onMessage, "addListener");
    const respond = vi.fn();

    handleMessages({});

    const listener = add.mock.calls[0]![0] as (message: unknown, sender: object, respond: () => void) => unknown;

    expect(listener("not a request", {}, respond)).toBeUndefined();
    expect(respond).not.toHaveBeenCalled();
  });
});

describe("onEvent", () => {
  it("hears the events of its name, and nothing else, until stopped", async () => {
    const heard = vi.fn();
    const stop = onEvent("library:changed", heard);

    await broadcast("tags:changed", { change: "added", ids: ["t"] });
    await broadcast("library:changed", { change: "added", ids: ["a"] });
    await fakeBrowser.runtime.sendMessage("not a message");
    expect(heard.mock.calls).toEqual([[{ change: "added", ids: ["a"] }]]);

    stop();
    await broadcast("library:changed", { change: "removed", ids: ["a"] });
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("broadcast", () => {
  it("also tells each open Discord tab, and skips tabs with no id", async () => {
    const tabs = vi.spyOn(fakeBrowser.tabs, "query").mockResolvedValue([{ id: 7 }, {}] as never);
    const send = vi.spyOn(fakeBrowser.tabs, "sendMessage").mockResolvedValue(undefined as never);

    await broadcast("library:changed", { change: "updated", ids: ["a"] });

    expect(tabs).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(7, expect.objectContaining({ channel: CHANNEL, kind: "event", name: "library:changed" }));
  });
});

describe("envelopes", () => {
  it("are told apart by their channel, kind and name", () => {
    const base = { channel: CHANNEL, name: "x", data: null };

    expect(isRequestEnvelope({ ...base, kind: "request" })).toBe(true);
    expect(isRequestEnvelope({ ...base, kind: "event" })).toBe(false);
    expect(isEventEnvelope({ ...base, kind: "event" })).toBe(true);
    expect(isEventEnvelope({ ...base, kind: "request" })).toBe(false);
    expect(isEventEnvelope({ ...base, channel: "other", kind: "event" })).toBe(false);
    expect(isEventEnvelope({ ...base, name: 5, kind: "event" })).toBe(false);
    expect(isEventEnvelope("event")).toBe(false);
    expect(isReply({ ok: false })).toBe(true);
    expect(isReply({ ok: "yes" })).toBe(false);
    expect(isReply(undefined)).toBe(false);
  });
});
