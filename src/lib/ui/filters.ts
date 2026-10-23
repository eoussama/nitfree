import type { TItem, TItemType, TPack, TTag } from "~/lib/db/types";



/**
 * What the panel's filter keeps: items of any of the chosen types, in any of the chosen packs, carrying
 * every chosen tag.
 */
export type TFilters = {
  types: TItemType[];
  tags: string[];
  packs: string[];
};

/**
 * One option in the filter menu, with how many items it covers.
 */
export type TFilterOption<T extends string> = {
  value: T;
  count: number;
};

/**
 * A filter that keeps everything.
 *
 * @returns A fresh, empty filter.
 */
export function noFilters(): TFilters {
  return { types: [], tags: [], packs: [] };
}

/**
 * How many filters are set.
 *
 * @param filters - The filter.
 * @returns The number of chosen types, tags and packs together.
 */
export function filterCount(filters: TFilters): number {
  return filters.types.length + filters.tags.length + filters.packs.length;
}

/**
 * Adds a value to a list, or takes it off when it is there already.
 *
 * @param list - The chosen values.
 * @param value - The value to flip.
 * @returns A new list.
 */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter(entry => entry !== value) : [...list, value];
}

/**
 * Keeps the items that pass the filter. Types are alternatives, as an item has just one: Emoji and GIF
 * shows both kinds. Packs are alternatives too, as an item can be in several and each is a group of its
 * own. Tags add up: an item must carry all of them.
 *
 * @param items - The library.
 * @param filters - The filter.
 * @returns The matching items, in their original order.
 */
export function applyFilters(items: readonly TItem[], filters: TFilters): TItem[] {
  const { types, tags, packs } = filters;

  if (!types.length && !tags.length && !packs.length) {
    return [...items];
  }

  return items.filter(item => (!types.length || types.includes(item.type))
    && (!packs.length || packs.some(pack => item.packs.includes(pack)))
    && tags.every(tag => item.tags.includes(tag)));
}

/**
 * How many items are in each pack, for the packs to choose from. Every pack is offered, even empty
 * ones, so a new pack can be found before anything is in it.
 *
 * @param items - The library.
 * @param packs - Every pack, in the order to offer them.
 * @returns One option per pack.
 */
export function packOptions(items: readonly TItem[], packs: readonly TPack[]): TFilterOption<string>[] {
  return packs.map(pack => ({ value: pack.id, count: items.filter(item => item.packs.includes(pack.id)).length }));
}

/**
 * The tags worth offering: those some item carries, plus the chosen ones, so a chosen tag can always be
 * switched off again. Each comes with the number of items carrying it.
 *
 * @param items - The library.
 * @param tags - Every tag, in the order to offer them.
 * @param chosen - The tags already chosen.
 * @returns The options, in the order of `tags`.
 */
export function tagOptions(items: readonly TItem[], tags: readonly TTag[], chosen: readonly string[]): TFilterOption<string>[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    for (const tag of item.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return tags
    .map(tag => ({ value: tag.id, count: counts.get(tag.id) ?? 0 }))
    .filter(option => option.count > 0 || chosen.includes(option.value));
}

/**
 * How many items there are of each type.
 *
 * @param items - The library.
 * @param types - The types to count, in the order to offer them.
 * @returns One option per type.
 */
export function typeOptions(items: readonly TItem[], types: readonly TItemType[]): TFilterOption<TItemType>[] {
  return types.map(type => ({ value: type, count: items.filter(item => item.type === type).length }));
}

/**
 * Drops chosen tags that no longer exist, such as after one is deleted.
 *
 * @param filters - The filter.
 * @param tags - The tags that exist.
 * @returns The same filter when nothing was dropped, else a new one.
 */
export function withoutMissingTags(filters: TFilters, tags: readonly TTag[]): TFilters {
  const kept = filters.tags.filter(id => tags.some(tag => tag.id === id));

  return kept.length === filters.tags.length ? filters : { ...filters, tags: kept };
}

/**
 * Drops chosen packs that no longer exist, such as after one is deleted.
 *
 * @param filters - The filter.
 * @param packs - The packs that exist.
 * @returns The same filter when nothing was dropped, else a new one.
 */
export function withoutMissingPacks(filters: TFilters, packs: readonly TPack[]): TFilters {
  const kept = filters.packs.filter(id => packs.some(pack => pack.id === id));

  return kept.length === filters.packs.length ? filters : { ...filters, packs: kept };
}

/**
 * Keeps the tags whose name contains what was typed, ignoring case.
 *
 * @param options - The tag options.
 * @param tags - Every tag, to look names up in.
 * @param query - What was typed in the menu's tag field.
 * @returns The matching options, in their order.
 */
export function findTagOptions(options: readonly TFilterOption<string>[], tags: readonly TTag[], query: string): TFilterOption<string>[] {
  const needle = query.trim().toLocaleLowerCase();

  return needle ? options.filter(option => tags.find(tag => tag.id === option.value)?.name.toLocaleLowerCase().includes(needle)) : [...options];
}
