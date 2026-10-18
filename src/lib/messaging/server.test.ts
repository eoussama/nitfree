import type { MockInstance } from "vitest";

import type { TRequestEnvelope } from "./envelope";

import type { THandlers } from "./server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decode, encode } from "./codec";
import { CHANNEL } from "./envelope";
import { broadcast, dispatch } from "./server";



const sender: Browser.runtime.MessageSender = {};

async function request(name: string, data?: unknown): Promise<TRequestEnvelope> {
  return { channel: CHANNEL, kind: "request", name, data: await encode(data) };
}

describe("dispatch", () => {
  it("answers with the handler's result", async () => {
    const handlers: Partial<THandlers> = { "runtime:ping": () => ({ version: "1.2.3" }) };

    expect(await dispatch(handlers, await request("runtime:ping"), sender)).toEqual({ ok: true, data: { version: "1.2.3" } });
  });

  it("awaits async handlers", async () => {
    const handlers: Partial<THandlers> = { "runtime:ping": async () => Promise.resolve({ version: "async" }) };

    expect(await dispatch(handlers, await request("runtime:ping"), sender)).toEqual({ ok: true, data: { version: "async" } });
  });

  it("reports a missing handler", async () => {
    const reply = await dispatch({}, await request("runtime:ping"), sender);

    expect(reply).toEqual({ ok: false, error: { name: "Error", message: "No handler for \"runtime:ping\"" } });
  });

  it("turns a thrown error into a failed reply", async () => {
    const handlers: Partial<THandlers> = {
      "runtime:ping": () => {
        throw new TypeError("broken");
      },
    };

    expect(await dispatch(handlers, await request("runtime:ping"), sender)).toEqual({ ok: false, error: { name: "TypeError", message: "broken" } });
  });

  it("decodes binary payloads before calling the handler and encodes the result", async () => {
    let received: unknown;
    const handlers = {
      "runtime:ping": (data: unknown) => {
        received = data;

        return data;
      },
    } as unknown as Partial<THandlers>;

    const blob = new Blob(["abc"], { type: "text/plain" });
    const reply = await dispatch(handlers, await request("runtime:ping", blob), sender);

    expect(received).toBeInstanceOf(Blob);
    expect(reply.ok).toBe(true);

    const restored = decode(reply.ok ? reply.data : undefined) as Blob;

    expect(await restored.text()).toBe("abc");
  });
});

describe("broadcast", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reaches extension pages and every Discord tab, skipping receivers that are not listening", async () => {
    // tabs.query is overloaded; the spy needs its promise form.
    const query = (vi.spyOn(browser.tabs, "query") as unknown as MockInstance<() => Promise<Browser.tabs.Tab[]>>)
      .mockResolvedValue([{ id: 3 }, {}, { id: 5 }] as Browser.tabs.Tab[]);
    const toTab = vi.spyOn(browser.tabs, "sendMessage").mockRejectedValueOnce(new Error("Receiving end does not exist")).mockResolvedValue(undefined);
    const toPages = vi.spyOn(browser.runtime, "sendMessage").mockRejectedValue(new Error("Could not establish connection"));

    await expect(broadcast("library:changed", { change: "added", ids: ["a"] })).resolves.toBeUndefined();

    const envelope = { channel: CHANNEL, kind: "event", name: "library:changed", data: { change: "added", ids: ["a"] } };

    expect(query).toHaveBeenCalledWith({ url: ["*://discord.com/*"] });
    expect(toPages).toHaveBeenCalledWith(envelope);
    expect(toTab).toHaveBeenCalledTimes(2);
    expect(toTab).toHaveBeenCalledWith(3, envelope);
    expect(toTab).toHaveBeenCalledWith(5, envelope);
  });
});
