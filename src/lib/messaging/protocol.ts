/**
 * Every request the background worker answers, with its payload and response.
 * Content scripts and the popup send these; only the background handles them.
 */
export interface TProtocol {
  "runtime:ping": { request: void; response: { version: string } };
}

/**
 * Every event the background worker broadcasts to open Discord tabs and
 * extension pages. Filled in as features start announcing changes.
 */
export type TEvents = Record<never, never>;

export type TRequestName = keyof TProtocol;
export type TRequest<K extends TRequestName> = TProtocol[K]["request"];
export type TResponse<K extends TRequestName> = TProtocol[K]["response"];
export type TRequestArgs<K extends TRequestName> = TRequest<K> extends void ? [] : [data: TRequest<K>];

export type TEventName = keyof TEvents;
