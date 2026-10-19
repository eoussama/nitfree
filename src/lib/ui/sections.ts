import type { TItem, TTag } from "~/lib/db";



export type TSectionId = "favorites" | "recent" | "all";

export type TSection = {
  id: TSectionId;
  items: TItem[];
};

/**
 * How many recently sent items the Recent section shows, like Discord's frequently used row.
 */
export const RECENT_LIMIT = 16;

/**
 * Lowercases text and strips its accents, so that "Café" and "cafe" meet.
 *
 * @param text - Any text.
 * @returns The text, folded.
 */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

/**
 * Keeps the items that match every word of the query in their title, description or tag names,
 * ignoring case and accents. A part of a word is enough: "ca" finds an item tagged "cat".
 *
 * @param items - The library.
 * @param query - What was typed in the search field.
 * @param tags - Every tag, to read the names of the ones items carry.
 * @returns The matching items, in their original order.
 */
export function filterItems(items: readonly TItem[], query: string, tags: readonly TTag[] = []): TItem[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [...items];
  }

  const names = new Map(tags.map(tag => [tag.id, foldText(tag.name)]));

  return items.filter((item) => {
    const text = [foldText(item.title), foldText(item.description), ...item.tags.map(id => names.get(id) ?? "")].join("\n");

    return words.every(word => text.includes(word));
  });
}

/**
 * Splits the library into the panel's sections: Favorites, Recent, then All files.
 * Empty sections are left out; an item can appear in more than one, as in Discord's picker.
 *
 * @param items - The library, newest first.
 * @returns The non-empty sections.
 */
export function buildSections(items: readonly TItem[]): TSection[] {
  const favorites = items.filter(item => item.favorite).sort((a, b) => a.title.localeCompare(b.title));
  const recent = items
    .filter(item => item.usedAt !== null)
    .sort((a, b) => (b.usedAt ?? 0) - (a.usedAt ?? 0))
    .slice(0, RECENT_LIMIT);
  const sections: TSection[] = [
    { id: "favorites", items: favorites },
    { id: "recent", items: recent },
    { id: "all", items: [...items] },
  ];

  return sections.filter(section => section.items.length > 0);
}
