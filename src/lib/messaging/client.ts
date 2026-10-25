import type { TEventEnvelope, TRequestEnvelope } from "./envelope";
import type { TEventName, TEvents, TRequestArgs, TRequestName, TResponse, TTabRequestArgs, TTabRequestName, TTabResponse } from "./protocol";
import { decode, encode } from "./codec";
import { CHANNEL, isEventEnvelope, isReply } from "./envelope";



async function envelopeOf(name: string, data: unknown): Promise<TRequestEnvelope> {
  return { channel: CHANNEL, kind: "request", name, data: await encode(data) };
}

/**
 * Sends a request to the background worker and resolves with its response.
 * Rejects with the handler's error when the background fails to answer.
 *
 * @param name - The request name.
 * @param args - The request payload, omitted for requests that take none.
 * @returns The handler's response.
 */
export async function sendMessage<K extends TRequestName>(name: K, ...args: TRequestArgs<K>): Promise<TResponse<K>> {
  const reply: unknown = await browser.runtime.sendMessage(await envelopeOf(name, args[0]));

  return unwrap(name, reply) as TResponse<K>;
}

/**
 * Sends a request to the content script of one Discord tab and resolves with its response.
 * Rejects when Nitfree does not run in that tab, or with the handler's error.
 *
 * @param tabId - The tab.
 * @param name - The request name.
 * @param args - The request payload, omitted for requests that take none.
 * @returns The handler's response.
 */
export async function sendTabMessage<K extends TTabRequestName>(tabId: number, name: K, ...args: TTabRequestArgs<K>): Promise<TTabResponse<K>> {
  const reply: unknown = await browser.tabs.sendMessage(tabId, await envelopeOf(name, args[0]));

  return unwrap(name, reply) as TTabResponse<K>;
}

function unwrap(name: string, reply: unknown): unknown {
  if (!isReply(reply)) {
    throw new Error(`No handler answered "${name}"`);
  }

  if (!reply.ok) {
    const error = new Error(reply.error.message);

    error.name = reply.error.name;

    throw error;
  }

  return decode(reply.data);
}

/**
 * Listens for an event broadcast by the background worker.
 *
 * @param name - The event name.
 * @param listener - Called with the event payload.
 * @returns A function that stops listening.
 */
export function onEvent<K extends TEventName>(name: K, listener: (data: TEvents[K]) => void): () => void {
  const handle = (message: unknown): undefined => {
    if (isEventEnvelope(message) && message.name === name) {
      listener(decode((message as TEventEnvelope).data) as TEvents[K]);
    }
  };

  browser.runtime.onMessage.addListener(handle);

  return () => browser.runtime.onMessage.removeListener(handle);
}
