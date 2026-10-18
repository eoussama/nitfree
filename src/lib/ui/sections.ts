import type { TItem } from "~/lib/db";



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
 * Keeps the items whose title contains the query, ignoring case.
 *
 * @param items - The library.
 * @param query - What was typed in the search field.
 * @returns The matching items, in their original order.
 */
export function filterItems(items: readonly TItem[], query: string): TItem[] {
  const needle = query.trim().toLocaleLowerCase();

  return needle ? items.filter(item => item.title.toLocaleLowerCase().includes(needle)) : [...items];
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
