import type { TImportTarget } from "./index";

import { describe, expect, it } from "vitest";

import { createLibrary } from "~/lib/db/library";
import { createPacks } from "~/lib/db/packs";
import { createTags } from "~/lib/db/tags";
import { openTestDatabase, steppingClock } from "~/lib/db/testing";
import { png } from "~/lib/media/fixtures";

import { applyArchive, readArchive, writeArchive } from "./index";



async function profile() {
  const db = await openTestDatabase();
  const clock = steppingClock();
  const library = createLibrary(db, clock);
  const tags = createTags(db, clock);
  const packs = createPacks(db, clock);
  const target: TImportTarget = {
    clear: async () => {
      await library.clear();
      await tags.clear();
      await packs.clear();
    },
    ensureTag: async tag => (await tags.ensure(tag)).tag,
    ensurePack: async pack => (await packs.ensure(pack)).pack,
    setPackIcon: (id, icon) => packs.update(id, { icon }),
    importItem: (item, skipDuplicates) => library.import(item, skipDuplicates),
  };

  return { library, tags, packs, target };
}

async function exported() {
  const source = await profile();
  const cats = await source.tags.add({ name: "Cats", color: "#fff" });
  const unused = await source.tags.add({ name: "Unused" });
  const a = await source.library.add({ file: new Blob([png(2, 2)]), type: "emoji", title: "A", tags: [cats.id], favorite: true });
  const b = await source.library.add({ file: new Blob([png(3, 3)]), type: "sticker", title: "B" });

  await source.library.use(a.id);

  const files = new Map([[a.id, png(2, 2)], [b.id, png(3, 3)]]);
  const bytes = await writeArchive({
    items: await source.library.list(),
    tags: await source.tags.list(),
    appVersion: "0.3.0",
    readFile: async item => files.get(item.id) ?? null,
  });

  return { bytes, a, b, cats, unused };
}

describe("applyArchive", () => {
  it("restores every item, tag and favorite into a fresh profile", async () => {
    const { bytes, a, b } = await exported();
    const fresh = await profile();
    const counts = await applyArchive(await readArchive(bytes), "merge", fresh.target);

    expect(counts).toEqual({ added: 2, skipped: 0, failed: 0 });

    const items = await fresh.library.list();
    const tags = await fresh.tags.list();

    expect(items.map(item => item.id).sort()).toEqual([a.id, b.id].sort());
    expect(tags.map(tag => tag.name)).toEqual(["Cats", "Unused"]);

    const restored = items.find(item => item.id === a.id)!;

    expect(restored).toMatchObject({ title: "A", favorite: true, usageCount: 1, createdAt: a.createdAt, hash: a.hash });
    expect(restored.tags).toEqual([tags.find(tag => tag.name === "Cats")!.id]);
    expect((await fresh.library.file(a.id))?.size).toBe(png(2, 2).length);
  });

  it("adds nothing the second time in merge mode", async () => {
    const { bytes } = await exported();
    const fresh = await profile();
    const archive = await readArchive(bytes);

    await applyArchive(archive, "merge", fresh.target);

    const again = await applyArchive(archive, "merge", fresh.target);

    expect(again).toEqual({ added: 0, skipped: 2, failed: 0 });
    expect(await fresh.library.list()).toHaveLength(2);
    expect(await fresh.tags.list()).toHaveLength(2);
  });

  it("merges into tags that exist already, whatever their case", async () => {
    const { bytes } = await exported();
    const fresh = await profile();
    const mine = await fresh.tags.add({ name: "cats" });

    await applyArchive(await readArchive(bytes), "merge", fresh.target);

    const tags = await fresh.tags.list();

    expect(tags.map(tag => tag.name)).toEqual(["cats", "Unused"]);
    expect((await fresh.library.list()).find(item => item.title === "A")?.tags).toEqual([mine.id]);
  });

  it("replaces the library, keeping duplicates the archive had", async () => {
    const { bytes } = await exported();
    const fresh = await profile();

    await fresh.library.add({ file: new Blob([png(9, 9)]), type: "image", title: "mine" });
    await fresh.tags.add({ name: "mine" });

    const counts = await applyArchive(await readArchive(bytes), "replace", fresh.target);

    expect(counts.added).toBe(2);
    expect((await fresh.library.list()).map(item => item.title).sort()).toEqual(["A", "B"]);
    expect((await fresh.tags.list()).map(tag => tag.name)).toEqual(["Cats", "Unused"]);
  });

  it("counts an item that fails and carries on with the rest", async () => {
    const { bytes } = await exported();
    const fresh = await profile();
    let calls = 0;
    const counts = await applyArchive(await readArchive(bytes), "merge", {
      ...fresh.target,
      importItem: async (item, skip) => {
        if (calls++ === 0) {
          throw new Error("quota");
        }

        return fresh.library.import(item, skip);
      },
    });

    expect(counts).toEqual({ added: 1, skipped: 0, failed: 1 });
  });

  it("imports a plain zip of images with folders as tags", async () => {
    const { zipSync } = await import("fflate");
    const fresh = await profile();
    const archive = await readArchive(zipSync({ "memes/cat.png": png(2, 2), "memes/dog.png": png(3, 3) }));
    const progress: number[] = [];

    expect(await applyArchive(archive, "merge", fresh.target, done => progress.push(done))).toEqual({ added: 2, skipped: 0, failed: 0 });
    expect(progress).toEqual([1, 2]);

    const [tag] = await fresh.tags.list();

    expect(tag?.name).toBe("memes");
    expect((await fresh.library.list()).every(item => item.tags.includes(tag!.id) && item.type === "image")).toBe(true);
  });

  it("leaves out a pack the archive's items name but never listed", async () => {
    const { bytes } = await exported();
    const fresh = await profile();
    const archive = await readArchive(bytes);

    archive.entries[0]!.packs = ["Ghost"];
    await applyArchive(archive, "merge", fresh.target);

    expect((await fresh.library.list()).every(item => item.packs.length === 0)).toBe(true);
    expect(await fresh.packs.list()).toEqual([]);
  });
});
