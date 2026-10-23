import type { TImportTarget } from "./index";

import type { TItem, TNotify } from "~/lib/db";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { createLibraryHandlers } from "~/lib/db/handlers";
import { createLibrary } from "~/lib/db/library";
import { createPacks } from "~/lib/db/packs";
import { createTags } from "~/lib/db/tags";
import { openTestDatabase, steppingClock } from "~/lib/db/testing";
import { png } from "~/lib/media/fixtures";

import { applyArchive, readArchive, writeArchive } from "./index";



const sender: Browser.runtime.MessageSender = {};

/**
 * A browser's library, written to through the background's own handlers, as an import from the popup is.
 *
 * @returns The services, what was announced, and the import target.
 */
async function profile() {
  const db = await openTestDatabase();
  const clock = steppingClock();
  const library = createLibrary(db, clock);
  const packs = createPacks(db, clock);
  const notify = vi.fn<TNotify>(async () => undefined);
  const handlers = createLibraryHandlers(library, createTags(db, clock), packs, notify);
  const target: TImportTarget = {
    clear: async () => handlers["library:clear"]!(undefined, sender),
    ensureTag: async tag => handlers["tags:ensure"]!(tag, sender),
    ensurePack: async pack => handlers["packs:ensure"]!(pack, sender),
    importItem: async (item, skipDuplicates) => handlers["library:import"]!({ item, skipDuplicates }, sender),
  };

  return { library, packs, notify, target };
}

describe("packs in archives", () => {
  it("round-trips the packs of the items, by name", async () => {
    const { library, packs } = await profile();
    const cats = await packs.add({ name: "Cats" });
    const bytes = png(4, 4);
    const item = await library.add({ file: new Blob([bytes]), type: "emoji", title: "a", packs: [cats.id] });
    const parsed = await readArchive(await writeArchive({
      items: [item],
      tags: [],
      packs: await packs.list(),
      appVersion: "0.4.0",
      readFile: async () => bytes,
    }));

    expect(parsed.packs).toEqual([expect.objectContaining({ id: cats.id, name: "Cats" })]);
    expect(parsed.entries[0]?.packs).toEqual(["Cats"]);
  });

  it("exports one pack alone, with only that pack, so its items keep no other", async () => {
    const { library, packs } = await profile();
    const cats = await packs.add({ name: "Cats" });
    const dogs = await packs.add({ name: "Dogs" });
    const bytes = png(2, 2);
    const item = await library.add({ file: new Blob([bytes]), type: "emoji", title: "a", packs: [cats.id, dogs.id] });
    const parsed = await readArchive(await writeArchive({
      items: [item],
      tags: [],
      packs: [cats],
      appVersion: "0.4.0",
      readFile: async () => bytes,
    }));

    expect(parsed.packs.map(pack => pack.name)).toEqual(["Cats"]);
    expect(parsed.entries.map(entry => entry.packs)).toEqual([["Cats"]]);
  });

  it("refuses an item in a pack the archive does not list", async () => {
    const { library, packs } = await profile();
    const cats = await packs.add({ name: "Cats" });
    const bytes = png(2, 2);
    const item = await library.add({ file: new Blob([bytes]), type: "emoji", title: "a", packs: [cats.id] });
    const archive = await writeArchive({ items: [{ ...item, packs: [] }], tags: [], packs: [], appVersion: "0.4.0", readFile: async () => bytes });
    const files = unzipSync(archive);
    const json = JSON.parse(strFromU8(files["library.json"]!)) as { items: { packs: string[] }[] };

    json.items[0]!.packs = ["gone"];
    files["library.json"] = strToU8(JSON.stringify(json));

    await expect(readArchive(zipSync(files))).rejects.toMatchObject({ reason: "unknownPack", params: { title: "a" } });
  });

  it("imports a pack on another browser with the same items and name, joining a pack of that name and the copies already there", async () => {
    const source = await profile();
    const cats = await source.packs.add({ name: "Cats" });
    const files = new Map<string, Uint8Array>();
    const items: TItem[] = [];

    for (const [title, size] of [["loaf", 2], ["beans", 3]] as const) {
      const bytes = png(size, size);
      const item = await source.library.add({ file: new Blob([bytes]), type: "emoji", title, packs: [cats.id] });

      files.set(item.id, bytes);
      items.push(item);
    }

    const archive = await readArchive(await writeArchive({
      items,
      tags: [],
      packs: [cats],
      appVersion: "0.4.0",
      readFile: async item => files.get(item.id) ?? null,
    }));

    // The other browser has a pack named the same, and one of the files already, outside any pack.
    const target = await profile();
    const existing = await target.packs.add({ name: "cats" });
    const copy = await target.library.add({ file: new Blob([png(2, 2)]), type: "emoji", title: "loaf" });

    target.notify.mockClear();

    const counts = await applyArchive(archive, "merge", target.target);

    expect(counts).toEqual({ added: 1, skipped: 1, failed: 0 });
    expect(await target.packs.list()).toEqual([existing]);
    const imported = await target.library.list();

    expect(imported.map(item => item.title).sort()).toEqual(["beans", "loaf"]);
    expect(imported.every(item => item.packs.length === 1 && item.packs[0] === existing.id)).toBe(true);
    // Open panels hear of the copy joining the pack, not only of the item added.
    expect(target.notify).toHaveBeenCalledWith("library:changed", { change: "updated", ids: [copy.id] });

    // Importing it again changes nothing.
    target.notify.mockClear();
    expect(await applyArchive(archive, "merge", target.target)).toEqual({ added: 0, skipped: 2, failed: 0 });
    expect(target.notify).not.toHaveBeenCalled();
  });
});
