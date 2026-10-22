import type { TImageFormat } from "~/lib/media";



export type TItemType = "emoji" | "sticker" | "gif" | "image";

export const ITEM_TYPES: readonly TItemType[] = ["emoji", "sticker", "gif", "image"];

/**
 * A library entry. Dates are milliseconds since the epoch.
 */
export type TItem = {
  id: string;
  type: TItemType;
  title: string;
  description: string;
  tags: string[];
  favorite: boolean;
  hash: string;
  size: number;
  format: TImageFormat;
  mime: string;
  width: number;
  height: number;
  animated: boolean;
  createdAt: number;
  updatedAt: number;
  usedAt: number | null;
  usageCount: number;
};

export type TTag = {
  id: string;
  name: string;
  color: string | null;
  createdAt: number;
};

export type TNewItem = {
  file: Blob;
  type: TItemType;
  title: string;
  description?: string;
  tags?: string[];
  favorite?: boolean;
};

/**
 * An item brought in from an archive: like a new item, but it may keep the id, dates and usage it had.
 */
export type TImportItem = TNewItem & {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
  usedAt?: number | null;
  usageCount?: number;
};

export type TItemPatch = Partial<Pick<TItem, "type" | "title" | "description" | "tags" | "favorite">> & {
  file?: Blob;
};

export type TNewTag = {
  name: string;
  color?: string | null;
};

export type TTagPatch = Partial<TNewTag>;

/**
 * What the sized copies take up: the bytes of every copy and how many there are.
 * Originals are not counted here, as each item carries its own file's size.
 */
export type TCacheUsage = {
  size: number;
  count: number;
};

/**
 * How items are stored: IndexedDB cannot index booleans, so `favorite` is kept as 0 or 1.
 */
export type TItemRow = Omit<TItem, "favorite"> & { favorite: 0 | 1 };

/**
 * An item's original file and its sized copies, keyed by a name the media pipeline chooses, e.g. "emoji-48".
 */
export type TBlobRow = {
  itemId: string;
  original: Blob;
  variants: Record<string, Blob>;
};

/**
 * How tags are stored: `key` is the normalized name that keeps names unique regardless of case.
 */
export type TTagRow = TTag & { key: string };

/**
 * Bookkeeping for the database itself, such as whether the previous version's library was moved over.
 */
export type TMetaRow = { key: string; value: unknown };
