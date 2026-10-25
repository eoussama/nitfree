import type { TMaybePromise } from "@eoussama/core";

import type { TEventEnvelope, TReply, TRequestEnvelope } from "./envelope";

import type { TEventName, TEvents, TRequest, TRequestName, TResponse, TTabRequest, TTabRequestName, TTabResponse } from "./protocol";
import { toError, tryCatch } from "@eoussama/core";
import { DISCORD_MATCHES } from "~/lib/discord";
import { decode, encode } from "./codec";
import { CHANNEL, isRequestEnvelope } from "./envelope";



export type THandlers = {
  [K in TRequestName]: (data: TRequest<K>, sender: Browser.runtime.MessageSender) => TMaybePromise<TResponse<K>>;
};

export type TTabHandlers = {
  [K in TTabRequestName]: (data: TTabRequest<K>, sender: Browser.runtime.MessageSender) => TMaybePromise<TTabResponse<K>>;
};



/**
 * Runs the handler for a request and wraps the outcome in a reply.
 *
 * @param handlers - The request handlers.
 * @param envelope - The received request.
 * @param sender - Where the request came from.
 * @returns The reply to send back.
 */
export async function dispatch(handlers: Partial<THandlers> | Partial<TTabHandlers>, envelope: TRequestEnvelope, sender: Browser.runtime.MessageSender): Promise<TReply> {
  const handler = (handlers as Record<string, ((data: unknown, sender: Browser.runtime.MessageSender) => unknown) | undefined>)[envelope.name];

  if (!handler) {
    return { ok: false, error: { name: "Error", message: `No handler for "${envelope.name}"` } };
  }

  const [error, data] = await tryCatch(async () => encode(await handler(decode(envelope.data), sender)));

  if (error) {
    const { name, message } = toError(error);

    return { ok: false, error: { name, message } };
  }

  return { ok: true, data };
}

function listen(handlers: Partial<THandlers> | Partial<TTabHandlers>): () => void {
  const listener = (message: unknown, sender: Browser.runtime.MessageSender, sendResponse: (reply: TReply) => void): true | undefined => {
    if (!isRequestEnvelope(message)) {
      return;
    }

    void dispatch(handlers, message, sender).then(sendResponse);

    return true;
  };

  browser.runtime.onMessage.addListener(listener);

  return () => browser.runtime.onMessage.removeListener(listener);
}

/**
 * Answers requests from content scripts and extension pages.
 * Call once, from the background worker.
 *
 * @param handlers - The request handlers.
 */
export function handleMessages(handlers: Partial<THandlers>): void {
  listen(handlers);
}

/**
 * Answers the popup's requests to this tab. Call from a Discord tab's content script.
 *
 * @param handlers - The request handlers.
 * @returns A function that stops answering.
 */
export function handleTabMessages(handlers: Partial<TTabHandlers>): () => void {
  return listen(handlers);
}

/**
 * Sends an event to every extension page and every open Discord tab.
 * Receivers that are not listening are skipped.
 *
 * @param name - The event name.
 * @param data - The event payload.
 * @returns Resolves once every receiver was tried.
 */
export async function broadcast<K extends TEventName>(name: K, data: TEvents[K]): Promise<void> {
  const envelope: TEventEnvelope = { channel: CHANNEL, kind: "event", name, data: await encode(data) };
  const tabs = await browser.tabs.query({ url: DISCORD_MATCHES });

  await Promise.allSettled([
    browser.runtime.sendMessage(envelope),
    ...tabs.flatMap(tab => (tab.id === undefined ? [] : [browser.tabs.sendMessage(tab.id, envelope)])),
  ]);
}
