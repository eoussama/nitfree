import type { TItem, TTag } from "~/lib/db/types";

import { foldText } from "./sections";



/**
 * How many suggestions show, as in Discord's emoji autocomplete.
 */
export const SUGGESTION_LIMIT = 10;

/**
 * A colon, at the start or after a space, then at least two characters of a name, right before the
 * caret: what makes Discord suggest emojis.
 */
const QUERY = /(?:^|\s):([\p{L}\p{N}_+-]{2,})$/u;

/**
 * Reads the emoji name being typed.
 *
 * @param text - The text of the line before the caret.
 * @returns The name typed after the colon, or null when no emoji is being typed.
 */
export function findEmojiQuery(text: string): string | null {
  return QUERY.exec(text)?.[1] ?? null;
}

/**
 * The items matching a typed name, in title or tags, ignoring case and accents, of any type: names
 * that start with it before names that hold it, titles before tags, then emojis before the other
 * types, and the most sent first.
 *
 * @param items - The library.
 * @param tags - Every tag, to read the names of the ones items carry.
 * @param query - The name typed after the colon.
 * @param limit - How many to keep.
 * @returns The matches, best first.
 */
export function suggestItems(items: readonly TItem[], tags: readonly TTag[], query: string, limit = SUGGESTION_LIMIT): TItem[] {
  const needle = foldText(query);
  const names = new Map(tags.map(tag => [tag.id, foldText(tag.name)]));
  const ranked: { item: TItem; rank: number }[] = [];

  for (const item of items) {
    const title = foldText(item.title);
    const tagNames = item.tags.map(id => names.get(id) ?? "");
    const rank = title.startsWith(needle)
      ? 0
      : title.includes(needle)
        ? 1
        : tagNames.some(name => name.startsWith(needle))
          ? 2
          : tagNames.some(name => name.includes(needle)) ? 3 : -1;

    if (rank !== -1) {
      ranked.push({ item, rank });
    }
  }

  return ranked
    .sort((a, b) => a.rank - b.rank || Number(b.item.type === "emoji") - Number(a.item.type === "emoji") || b.item.usageCount - a.item.usageCount || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map(entry => entry.item);
}
