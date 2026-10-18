import type { TRequestEnvelope } from "./envelope";

import type { THandlers } from "./server";
import { describe, expect, it } from "vitest";
import { decode, encode } from "./codec";
import { CHANNEL } from "./envelope";
import { dispatch } from "./server";



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
