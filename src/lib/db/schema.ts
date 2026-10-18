import type { EntityTable } from "dexie";

import type { TBlobRow, TItemRow, TMetaRow, TTagRow } from "./types";

import Dexie from "dexie";



export const DATABASE_NAME = "nitfree-library";

/**
 * The library database. Opened by the background worker only, so it lives in the
 * extension's origin and survives clearing Discord's site data.
 */
export class NitfreeDatabase extends Dexie {
  items!: EntityTable<TItemRow, "id">;
  blobs!: EntityTable<TBlobRow, "itemId">;
  tags!: EntityTable<TTagRow, "id">;
  meta!: EntityTable<TMetaRow, "key">;

  /**
   * Opens, or creates, the library database.
   *
   * @param name - The database name; tests pass their own to stay isolated.
   */
  constructor(name = DATABASE_NAME) {
    super(name);

    this.version(1).stores({
      items: "id, title, *tags, type, favorite, usedAt, hash, createdAt",
      blobs: "itemId",
      tags: "id, &key",
      meta: "key",
    });
  }
}
