import type { TLibrary } from "./library";

import type { TPacks } from "./packs";
import type { TTags } from "./tags";
import type { TEventName, TEvents, THandlers } from "~/lib/messaging";



export type TNotify = <K extends TEventName>(name: K, data: TEvents[K]) => Promise<void>;

/**
 * Answers library, tag and pack requests, announcing every change so open panels and the popup refresh.
 *
 * @param library - The library service.
 * @param tags - The tag service.
 * @param packs - The pack service.
 * @param notify - Broadcasts an event; announcements never delay or fail a request.
 * @returns The request handlers.
 */
export function createLibraryHandlers(library: TLibrary, tags: TTags, packs: TPacks, notify: TNotify): Partial<THandlers> {
  function announce<K extends TEventName>(name: K, data: TEvents[K]): void {
    notify(name, data).catch(() => undefined);
  }

  return {
    "library:list": () => library.list(),
    "library:get": ({ id }) => library.get(id),
    "library:file": ({ id }) => library.file(id),
    // Sized copies change nothing anyone sees, so storing one is not announced.
    "library:variant": ({ id, key }) => library.variant(id, key),
    "library:storeVariant": ({ id, key, file }) => library.storeVariant(id, key, file),
    "library:cacheUsage": () => library.cacheUsage(),
    // Panels keep the copies they already show, and make any others again, so clearing is not announced either.
    "library:clearCache": () => library.clearCache(),

    "library:add": async (input) => {
      const item = await library.add(input);

      announce("library:changed", { change: "added", ids: [item.id] });

      return item;
    },

    "library:import": async ({ item, skipDuplicates }) => {
      const result = await library.import(item, skipDuplicates);

      if (result.status !== "skipped") {
        announce("library:changed", { change: result.status === "added" ? "added" : "updated", ids: [result.item.id] });
      }

      return result;
    },

    "library:clear": async () => {
      const ids = await library.clear();
      const tagIds = await tags.clear();
      const packIds = await packs.clear();

      if (ids.length) {
        announce("library:changed", { change: "removed", ids });
      }

      if (tagIds.length) {
        announce("tags:changed", { change: "removed", ids: tagIds });
      }

      if (packIds.length) {
        announce("packs:changed", { change: "removed", ids: packIds });
      }
    },

    "library:update": async ({ id, patch }) => {
      const item = await library.update(id, patch);

      announce("library:changed", { change: "updated", ids: [id] });

      return item;
    },

    "library:remove": async ({ id }) => {
      const existed = await library.remove(id);

      if (existed) {
        announce("library:changed", { change: "removed", ids: [id] });
      }

      return existed;
    },

    "library:removeMany": async ({ ids }) => {
      const removed = await library.removeMany(ids);

      if (removed.length) {
        announce("library:changed", { change: "removed", ids: removed });
      }

      return removed;
    },

    // Fingerprints made while looking change nothing anyone sees.
    "library:duplicates": () => library.duplicates(),

    "library:similar": picture => library.similar(picture),

    "library:merge": async ({ keep, remove }) => {
      const { item, removed } = await library.merge(keep, remove);

      announce("library:changed", { change: "updated", ids: [keep] });

      if (removed.length) {
        announce("library:changed", { change: "removed", ids: removed });
      }

      return item;
    },

    "library:use": async ({ id }) => {
      const item = await library.use(id);

      announce("library:changed", { change: "updated", ids: [id] });

      return item;
    },

    "tags:list": () => tags.list(),

    "tags:add": async (input) => {
      const tag = await tags.add(input);

      announce("tags:changed", { change: "added", ids: [tag.id] });

      return tag;
    },

    "tags:ensure": async (input) => {
      const { tag, created } = await tags.ensure(input);

      if (created) {
        announce("tags:changed", { change: "added", ids: [tag.id] });
      }

      return tag;
    },

    "tags:update": async ({ id, patch }) => {
      const tag = await tags.update(id, patch);

      announce("tags:changed", { change: "updated", ids: [id] });

      return tag;
    },

    "tags:remove": async ({ id }) => {
      const items = await tags.remove(id);

      announce("tags:changed", { change: "removed", ids: [id] });

      if (items.length) {
        announce("library:changed", { change: "updated", ids: items });
      }
    },

    "packs:list": () => packs.list(),

    "packs:add": async (input) => {
      const pack = await packs.add(input);

      announce("packs:changed", { change: "added", ids: [pack.id] });

      return pack;
    },

    "packs:ensure": async (input) => {
      const { pack, created } = await packs.ensure(input);

      if (created) {
        announce("packs:changed", { change: "added", ids: [pack.id] });
      }

      return pack;
    },

    "packs:update": async ({ id, patch }) => {
      const pack = await packs.update(id, patch);

      announce("packs:changed", { change: "updated", ids: [id] });

      return pack;
    },

    "packs:remove": async ({ id }) => {
      const items = await packs.remove(id);

      announce("packs:changed", { change: "removed", ids: [id] });

      if (items.length) {
        announce("library:changed", { change: "updated", ids: items });
      }
    },
  };
}
