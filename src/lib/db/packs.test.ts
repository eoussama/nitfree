import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";

import { png } from "~/test/fixtures";

import { createLibrary } from "./library";
import { createPacks } from "./packs";
import { NitfreeDatabase } from "./schema";
import { openTestDatabase, steppingClock } from "./testing";



let db: NitfreeDatabase;
let library: ReturnType<typeof createLibrary>;
let packs: ReturnType<typeof createPacks>;

beforeEach(async () => {
  db = await openTestDatabase();

  const clock = steppingClock();

  library = createLibrary(db, clock);
  packs = createPacks(db, clock);
});

describe("packs", () => {
  it("creates and lists packs by name, and keeps names unique regardless of case", async () => {
    const zebras = await packs.add({ name: "Zebras" });
    const cats = await packs.add({ name: "  cats  " });

    expect(cats).toMatchObject({ name: "cats" });
    expect((await packs.list()).map(pack => pack.name)).toEqual(["cats", "Zebras"]);
    expect(await packs.list()).toContainEqual(zebras);
    await expect(packs.add({ name: "ZEBRAS" })).rejects.toThrow(/already exists/);
    await expect(packs.add({ name: "  " })).rejects.toThrow(/needs a name/);
  });

  it("finds the pack with a name, or creates it, so an import joins a pack already there", async () => {
    const cats = await packs.add({ name: "Cats" });

    expect(await packs.ensure({ name: "cats" })).toEqual({ pack: cats, created: false });

    const { pack, created } = await packs.ensure({ name: "Dogs" });

    expect(created).toBe(true);
    expect(pack.name).toBe("Dogs");
  });

  it("renames a pack, and refuses a name another pack has", async () => {
    const cats = await packs.add({ name: "Cats" });

    await packs.add({ name: "Dogs" });

    expect(await packs.update(cats.id, { name: " Kittens " })).toEqual({ ...cats, name: "Kittens" });
    await expect(packs.update(cats.id, { name: "dogs" })).rejects.toThrow(/already exists/);
    await expect(packs.update("missing", { name: "x" })).rejects.toThrow(/No pack/);
  });

  it("deletes a pack and takes it off its items, which stay in the library", async () => {
    const cats = await packs.add({ name: "Cats" });
    const dogs = await packs.add({ name: "Dogs" });
    const item = await library.add({ file: new Blob([png(2, 2)]), type: "emoji", title: "a", packs: [cats.id, dogs.id] });

    expect(await packs.remove(cats.id)).toEqual([item.id]);
    expect(await library.get(item.id)).toMatchObject({ packs: [dogs.id] });
    expect(await packs.list()).toEqual([dogs]);
  });

  it("sets the item that shows a pack, only from the pack's items, and goes back to none", async () => {
    const cats = await packs.add({ name: "Cats" });
    const inside = await library.add({ file: new Blob([png(2, 2)]), type: "emoji", title: "a", packs: [cats.id] });
    const outside = await library.add({ file: new Blob([png(3, 3)]), type: "emoji", title: "b" });

    expect(cats.icon).toBeNull();
    expect(await packs.update(cats.id, { icon: inside.id })).toEqual({ ...cats, icon: inside.id });
    await expect(packs.update(cats.id, { icon: outside.id })).rejects.toThrow(/not in the pack/);
    await expect(packs.update(cats.id, { icon: "missing" })).rejects.toThrow(/not in the pack/);

    // Renaming keeps the icon.
    expect(await packs.update(cats.id, { name: "Kittens" })).toMatchObject({ name: "Kittens", icon: inside.id });
    expect(await packs.update(cats.id, { icon: null })).toMatchObject({ icon: null });
  });

  it("clears every pack", async () => {
    const cats = await packs.add({ name: "Cats" });

    expect(await packs.clear()).toEqual([cats.id]);
    expect(await packs.list()).toEqual([]);
  });
});

describe("upgrade", () => {
  it("gives items stored before packs existed an empty list, and keeps everything else", async () => {
    const name = `nitfree-test-upgrade-${crypto.randomUUID()}`;
    const old = new Dexie(name);

    old.version(1).stores({ items: "id, title, *tags, type, favorite, usedAt, hash, createdAt", blobs: "itemId", tags: "id, &key", meta: "key" });
    await old.table("items").add({ id: "old", title: "loaf", tags: ["t"], type: "emoji", favorite: 1, usedAt: null, hash: "h", createdAt: 1 });
    old.close();

    const upgraded = new NitfreeDatabase(name);

    expect(await upgraded.items.get("old")).toMatchObject({ title: "loaf", tags: ["t"], packs: [] });
    expect(await upgraded.items.where("packs").equals("anything").count()).toBe(0);
    expect(await upgraded.packs.count()).toBe(0);
    upgraded.close();
  });
});

describe("items in packs", () => {
  it("puts items in packs when added and when edited, and refuses an unknown pack", async () => {
    const cats = await packs.add({ name: "Cats" });
    const dogs = await packs.add({ name: "Dogs" });
    const item = await library.add({ file: new Blob([png(2, 2)]), type: "emoji", title: "a", packs: [cats.id, cats.id] });

    expect(item.packs).toEqual([cats.id]);
    expect(await library.update(item.id, { packs: [dogs.id] })).toMatchObject({ packs: [dogs.id] });
    await expect(library.add({ file: new Blob([png(2, 2)]), type: "emoji", title: "b", packs: ["nope"] })).rejects.toThrow(/Unknown pack "nope"/);
  });

  it("lets a duplicate import join the packs of the copy already in the library", async () => {
    const bytes = png(3, 3);
    const cats = await packs.add({ name: "Cats" });
    const existing = await library.add({ file: new Blob([bytes]), type: "emoji", title: "a" });

    expect(await library.import({ file: new Blob([bytes]), type: "emoji", title: "a", packs: [cats.id] }, true)).toMatchObject({ status: "joined", item: { id: existing.id, packs: [cats.id] } });
    expect(await library.get(existing.id)).toMatchObject({ packs: [cats.id] });
    expect(await library.list()).toHaveLength(1);

    // Already in the pack, or brought in without one, the duplicate changes nothing.
    expect(await library.import({ file: new Blob([bytes]), type: "emoji", title: "a", packs: [cats.id] }, true)).toMatchObject({ status: "skipped", item: { id: existing.id } });
    expect((await library.import({ file: new Blob([bytes]), type: "emoji", title: "a" }, true)).status).toBe("skipped");
  });

  it("merges the packs of duplicates into the item kept", async () => {
    const bytes = png(2, 2);
    const cats = await packs.add({ name: "Cats" });
    const dogs = await packs.add({ name: "Dogs" });
    const kept = await library.add({ file: new Blob([bytes]), type: "emoji", title: "kept", packs: [cats.id] });
    const other = await library.add({ file: new Blob([bytes]), type: "emoji", title: "other", packs: [dogs.id, cats.id] });

    expect(await library.merge(kept.id, [other.id])).toMatchObject({ item: { packs: [cats.id, dogs.id] } });
  });
});
