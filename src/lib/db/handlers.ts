import type { TLibrary } from "./library";

import type { TTags } from "./tags";
import type { TEventName, TEvents, THandlers } from "~/lib/messaging";



export type TNotify = <K extends TEventName>(name: K, data: TEvents[K]) => Promise<void>;

/**
 * Answers library and tag requests, announcing every change so open panels and the popup refresh.
 *
 * @param library - The library service.
 * @param tags - The tag service.
 * @param notify - Broadcasts an event; announcements never delay or fail a request.
 * @returns The request handlers.
 */
export function createLibraryHandlers(library: TLibrary, tags: TTags, notify: TNotify): Partial<THandlers> {
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

    "library:add": async (input) => {
      const item = await library.add(input);

      announce("library:changed", { change: "added", ids: [item.id] });

      return item;
    },

    "library:import": async ({ item, skipDuplicates }) => {
      const imported = await library.import(item, skipDuplicates);

      if (imported) {
        announce("library:changed", { change: "added", ids: [imported.id] });
      }

      return imported;
    },

    "library:clear": async () => {
      const ids = await library.clear();
      const tagIds = await tags.clear();

      if (ids.length) {
        announce("library:changed", { change: "removed", ids });
      }

      if (tagIds.length) {
        announce("tags:changed", { change: "removed", ids: tagIds });
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
  };
}
