import type { TEventEnvelope, TRequestEnvelope } from "./envelope";
import type { TEventName, TEvents, TRequestArgs, TRequestName, TResponse } from "./protocol";
import { decode, encode } from "./codec";
import { CHANNEL, isEventEnvelope, isReply } from "./envelope";



/**
 * Sends a request to the background worker and resolves with its response.
 * Rejects with the handler's error when the background fails to answer.
 *
 * @param name - The request name.
 * @param args - The request payload, omitted for requests that take none.
 * @returns The handler's response.
 */
export async function sendMessage<K extends TRequestName>(name: K, ...args: TRequestArgs<K>): Promise<TResponse<K>> {
  const envelope: TRequestEnvelope = { channel: CHANNEL, kind: "request", name, data: await encode(args[0]) };
  const reply: unknown = await browser.runtime.sendMessage(envelope);

  if (!isReply(reply)) {
    throw new Error(`No handler answered "${name}"`);
  }

  if (!reply.ok) {
    const error = new Error(reply.error.message);

    error.name = reply.error.name;

    throw error;
  }

  return decode(reply.data) as TResponse<K>;
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
