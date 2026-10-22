import type { TCacheUsage, TImportItem, TItem, TItemPatch, TNewItem, TNewTag, TTag, TTagPatch } from "~/lib/db";



/**
 * Every request the background worker answers, with its payload and response.
 * Content scripts and the popup send these; only the background handles them.
 */
export interface TProtocol {
  "runtime:ping": { request: void; response: { version: string } };

  "library:list": { request: void; response: TItem[] };
  "library:get": { request: { id: string }; response: TItem | null };
  "library:add": { request: TNewItem; response: TItem };
  "library:update": { request: { id: string; patch: TItemPatch }; response: TItem };
  "library:remove": { request: { id: string }; response: boolean };
  "library:removeMany": { request: { ids: string[] }; response: string[] };
  "library:use": { request: { id: string }; response: TItem };
  "library:file": { request: { id: string }; response: Blob | null };
  "library:import": { request: { item: TImportItem; skipDuplicates: boolean }; response: TItem | null };
  "library:clear": { request: void; response: void };
  "library:variant": { request: { id: string; key: string }; response: Blob | null };
  "library:storeVariant": { request: { id: string; key: string; file: Blob }; response: void };
  "library:cacheUsage": { request: void; response: TCacheUsage };
  "library:clearCache": { request: void; response: TCacheUsage };

  "tags:list": { request: void; response: TTag[] };
  "tags:add": { request: TNewTag; response: TTag };
  "tags:ensure": { request: TNewTag; response: TTag };
  "tags:update": { request: { id: string; patch: TTagPatch }; response: TTag };
  "tags:remove": { request: { id: string }; response: void };
}

export type TChange = "added" | "updated" | "removed";

/**
 * Every event the background worker broadcasts to open Discord tabs and extension pages.
 */
export type TEvents = {
  "library:changed": { change: TChange; ids: string[] };
  "tags:changed": { change: TChange; ids: string[] };
};

export type TRequestName = keyof TProtocol;
export type TRequest<K extends TRequestName> = TProtocol[K]["request"];
export type TResponse<K extends TRequestName> = TProtocol[K]["response"];
export type TRequestArgs<K extends TRequestName> = TRequest<K> extends void ? [] : [data: TRequest<K>];

export type TEventName = keyof TEvents;
