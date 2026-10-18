import { isObject } from "@eoussama/core";



/**
 * Marks Nitfree's own messages so listeners ignore anything else on the channel.
 */
export const CHANNEL = "nitfree";

export type TRequestEnvelope = { channel: typeof CHANNEL; kind: "request"; name: string; data: unknown };
export type TEventEnvelope = { channel: typeof CHANNEL; kind: "event"; name: string; data: unknown };

export type TReply
  = | { ok: true; data: unknown }
    | { ok: false; error: { name: string; message: string } };



function isEnvelope(value: unknown): value is Record<string, unknown> {
  return isObject(value) && value.channel === CHANNEL && typeof value.name === "string";
}

/**
 * Checks whether a message is a Nitfree request.
 *
 * @param value - The received message.
 * @returns Whether the message is a request envelope.
 */
export function isRequestEnvelope(value: unknown): value is TRequestEnvelope {
  return isEnvelope(value) && value.kind === "request";
}

/**
 * Checks whether a message is a Nitfree event.
 *
 * @param value - The received message.
 * @returns Whether the message is an event envelope.
 */
export function isEventEnvelope(value: unknown): value is TEventEnvelope {
  return isEnvelope(value) && value.kind === "event";
}

/**
 * Checks whether a response came from a Nitfree handler.
 *
 * @param value - The response passed back by the browser.
 * @returns Whether the response is a reply.
 */
export function isReply(value: unknown): value is TReply {
  return isObject(value) && typeof value.ok === "boolean";
}
