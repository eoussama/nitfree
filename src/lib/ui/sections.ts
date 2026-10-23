import type { TItem, TPack, TTag } from "~/lib/db";



export type TFixedSectionId = "favorites" | "recent" | "all";

export type TSectionId = TFixedSectionId | `pack:${string}`;

/**
 * One of the panel's sections: a fixed one, or a pack's, which carries the pack.
 */
export type TSection
  = | { id: TFixedSectionId; pack?: undefined; items: TItem[] }
    | { id: `pack:${string}`; pack: TPack; items: TItem[] };

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
 * Keeps the items that match every word of the query in their title, description, tag names or the
 * names of the packs they are in, ignoring case and accents. A part of a word is enough: "ca" finds an
 * item tagged "cat", and the name of a pack finds what is in it.
 *
 * @param items - The library.
 * @param query - What was typed in the search field.
 * @param tags - Every tag, to read the names of the ones items carry.
 * @param packs - Every pack, to read the names of the ones items are in.
 * @returns The matching items, in their original order.
 */
export function filterItems(items: readonly TItem[], query: string, tags: readonly TTag[] = [], packs: readonly TPack[] = []): TItem[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [...items];
  }

  const names = new Map([...tags, ...packs].map(named => [named.id, foldText(named.name)]));

  return items.filter((item) => {
    const text = [foldText(item.title), foldText(item.description), ...[...item.tags, ...item.packs].map(id => names.get(id) ?? "")].join("\n");

    return words.every(word => text.includes(word));
  });
}

/**
 * The item that shows a pack in the sidebar: the one picked for it while it is still in the pack, else
 * the pack's newest.
 *
 * @param pack - The pack.
 * @param items - The library, newest first.
 * @returns The item, or null when the pack is empty.
 */
export function packIcon(pack: TPack, items: readonly TItem[]): TItem | null {
  const inPack = items.filter(item => item.packs.includes(pack.id));

  return inPack.find(item => item.id === pack.icon) ?? inPack[0] ?? null;
}

/**
 * Splits the library into the panel's sections: Favorites, Recent, a section for each pack, by name,
 * then All files. Empty sections are left out; an item can appear in more than one, as in Discord's
 * picker.
 *
 * @param items - The library, newest first.
 * @param packs - Every pack, by name.
 * @returns The non-empty sections.
 */
export function buildSections(items: readonly TItem[], packs: readonly TPack[] = []): TSection[] {
  const favorites = items.filter(item => item.favorite).sort((a, b) => a.title.localeCompare(b.title));
  const recent = items
    .filter(item => item.usedAt !== null)
    .sort((a, b) => (b.usedAt ?? 0) - (a.usedAt ?? 0))
    .slice(0, RECENT_LIMIT);
  const sections: TSection[] = [
    { id: "favorites", items: favorites },
    { id: "recent", items: recent },
    ...packs.map((pack): TSection => ({ id: `pack:${pack.id}`, pack, items: items.filter(item => item.packs.includes(pack.id)) })),
    { id: "all", items: [...items] },
  ];

  return sections.filter(section => section.items.length > 0);
}
