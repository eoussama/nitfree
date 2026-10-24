import type { NitfreeDatabase } from "./schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { gif, png, webpExtended } from "~/test/fixtures";

import { createLibrary, hashBytes } from "./library";
import { createTags } from "./tags";
import { openTestDatabase, steppingClock } from "./testing";



let db: NitfreeDatabase;
let library: ReturnType<typeof createLibrary>;
let tags: ReturnType<typeof createTags>;

beforeEach(async () => {
  db = await openTestDatabase();

  const clock = steppingClock();

  library = createLibrary(db, clock);
  tags = createTags(db, clock);
});

function file(bytes: Uint8Array<ArrayBuffer>, type = ""): Blob {
  return new Blob([bytes], { type });
}

describe("the library, in detail", () => {
  it("trims descriptions on adding, importing and editing, and leaves them empty when none is given", async () => {
    const added = await library.add({ file: file(png(4, 4)), type: "emoji", title: "a", description: "  hi  " });
    const imported = await library.import({ file: file(png(5, 5)), type: "emoji", title: "b", description: "  yo  " }, false);
    const bare = await library.import({ file: file(png(6, 6)), type: "emoji", title: "c" }, false);

    expect([added.description, imported.item.description, bare.item.description]).toEqual(["hi", "yo", ""]);
    expect((await library.update(added.id, { description: "  new  " })).description).toBe("new");
  });

  it("names the tags and packs it does not know", async () => {
    await expect(library.add({ file: file(png(4, 4)), type: "emoji", title: "a", tags: ["x"] })).rejects.toThrow("Unknown tag \"x\"");
    await expect(library.add({ file: file(png(4, 4)), type: "emoji", title: "a", packs: ["y"] })).rejects.toThrow("Unknown pack \"y\"");
  });

  it("refuses a type it does not know on importing and editing", async () => {
    const item = await library.add({ file: file(png(4, 4)), type: "emoji", title: "a" });

    await expect(library.import({ file: file(png(5, 5)), type: "odd" as never, title: "b" }, false)).rejects.toThrow("Unknown item type \"odd\"");
    await expect(library.update(item.id, { type: "odd" as never })).rejects.toThrow("Unknown item type \"odd\"");
  });

  it("changes only what an edit names", async () => {
    const tag = await tags.add({ name: "Cats" });
    const item = await library.add({ file: file(png(4, 4)), type: "sticker", title: "a", description: "d", tags: [tag.id], favorite: true });
    const updated = await library.update(item.id, { title: "b" });

    expect(updated).toMatchObject({ title: "b", type: "sticker", description: "d", tags: [tag.id], packs: [], favorite: true });
  });

  it("keeps the latest send, a description, and no time sent for items never sent, when merging", async () => {
    const make = (title: string, size: number) => library.add({ file: file(png(size, size)), type: "emoji", title });
    const [a, b, c] = [await make("a", 4), await make("b", 5), await make("c", 6)];

    expect((await library.merge(a.id, [b.id])).item).toMatchObject({ usedAt: null, description: "" });

    await library.use(c.id);

    const [d] = [await make("d", 7)];

    await library.use(d.id);

    const earlier = (await library.get(c.id))!.usedAt!;
    const later = (await library.get(d.id))!.usedAt!;
    const merged = (await library.merge(c.id, [d.id])).item;

    expect(later).toBeGreaterThan(earlier);
    expect(merged.usedAt).toBe(later);
  });

  it("has no copy for an item that is gone", async () => {
    expect(await library.variant("gone", "emoji-48")).toBeNull();
  });
});

describe("add", () => {
  it("stores the file with what it learns from it", async () => {
    const bytes = gif(64, 32, 3);
    const item = await library.add({ file: file(bytes), type: "emoji", title: "  party  ", favorite: true });

    expect(item).toMatchObject({
      type: "emoji",
      title: "party",
      description: "",
      tags: [],
      favorite: true,
      hash: await hashBytes(bytes),
      size: bytes.length,
      format: "gif",
      mime: "image/gif",
      width: 64,
      height: 32,
      animated: true,
      createdAt: 1_000,
      updatedAt: 1_000,
      usedAt: null,
      usageCount: 0,
    });
    expect(await library.get(item.id)).toEqual(item);

    const stored = await library.file(item.id);

    expect(stored?.type).toBe("image/gif");
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(bytes);
  });

  it("rejects unsupported files, unknown types, empty titles and unknown tags", async () => {
    await expect(library.add({ file: new Blob(["<svg/>"]), type: "emoji", title: "x" })).rejects.toThrow(/Unsupported file/);
    await expect(library.add({ file: file(png(1, 1)), type: "video" as never, title: "x" })).rejects.toThrow(/Unknown item type/);
    await expect(library.add({ file: file(png(1, 1)), type: "emoji", title: "   " })).rejects.toThrow(/needs a title/);
    await expect(library.add({ file: file(png(1, 1)), type: "emoji", title: "x", tags: ["nope"] })).rejects.toThrow(/Unknown tag "nope"/);
    expect(await library.list()).toEqual([]);
    expect(await db.blobs.count()).toBe(0);
  });

  it("deduplicates tag ids", async () => {
    const tag = await tags.add({ name: "Cats" });
    const item = await library.add({ file: file(png(1, 1)), type: "image", title: "x", tags: [tag.id, tag.id] });

    expect(item.tags).toEqual([tag.id]);
  });
});

describe("list and lookups", () => {
  it("lists newest first and finds by hash", async () => {
    const first = await library.add({ file: file(png(1, 1)), type: "image", title: "first" });
    const second = await library.add({ file: file(png(2, 2)), type: "image", title: "second" });
    const copy = await library.add({ file: file(png(1, 1)), type: "sticker", title: "copy" });

    expect((await library.list()).map(item => item.id)).toEqual([copy.id, second.id, first.id]);
    expect((await library.findByHash(first.hash)).map(item => item.id).sort()).toEqual([first.id, copy.id].sort());
    expect(await library.get("missing")).toBeNull();
  });

  it("indexes favorites, tags, types and recent use", async () => {
    const tag = await tags.add({ name: "Cats" });
    const cat = await library.add({ file: file(png(1, 1)), type: "emoji", title: "cat", tags: [tag.id], favorite: true });

    await library.add({ file: file(png(2, 2)), type: "sticker", title: "dog" });
    await library.use(cat.id);

    expect(await db.items.where("favorite").equals(1).primaryKeys()).toEqual([cat.id]);
    expect(await db.items.where("tags").equals(tag.id).primaryKeys()).toEqual([cat.id]);
    expect(await db.items.where("type").equals("emoji").primaryKeys()).toEqual([cat.id]);
    expect(await db.items.orderBy("usedAt").primaryKeys()).toEqual([cat.id]);
    expect(await db.items.where("title").startsWith("do").count()).toBe(1);
  });
});

describe("update", () => {
  it("edits fields and keeps cached copies when the file is unchanged", async () => {
    const item = await library.add({ file: file(png(10, 10)), type: "image", title: "a" });

    await library.storeVariant(item.id, "emoji-48", file(png(48, 48)));

    const updated = await library.update(item.id, { title: "b", description: " d ", favorite: true, type: "emoji" });

    expect(updated).toMatchObject({ title: "b", description: "d", favorite: true, type: "emoji", hash: item.hash, createdAt: item.createdAt });
    expect(updated.updatedAt).toBeGreaterThan(item.updatedAt);
    expect(await library.variant(item.id, "emoji-48")).not.toBeNull();
  });

  it("replacing the file re-reads it and drops cached copies", async () => {
    const item = await library.add({ file: file(png(10, 10)), type: "image", title: "a" });

    await library.storeVariant(item.id, "emoji-48", file(png(48, 48)));

    const next = webpExtended(300, 200, true);
    const updated = await library.update(item.id, { file: file(next) });

    expect(updated).toMatchObject({ format: "webp", width: 300, height: 200, animated: true, size: next.length, hash: await hashBytes(next) });
    expect(await library.variant(item.id, "emoji-48")).toBeNull();
    expect((await library.file(item.id))?.size).toBe(next.length);
  });

  it("rejects missing items and bad input without changing anything", async () => {
    const item = await library.add({ file: file(png(1, 1)), type: "image", title: "a" });

    await expect(library.update("missing", { title: "b" })).rejects.toThrow(/No item "missing"/);
    await expect(library.update(item.id, { title: "" })).rejects.toThrow(/needs a title/);
    await expect(library.update(item.id, { tags: ["nope"] })).rejects.toThrow(/Unknown tag/);
    await expect(library.update(item.id, { file: new Blob(["text"]) })).rejects.toThrow(/Unsupported file/);
    expect(await library.get(item.id)).toEqual(item);
  });
});

describe("remove, use and variants", () => {
  it("removes the item and its files", async () => {
    const item = await library.add({ file: file(png(1, 1)), type: "image", title: "a" });

    expect(await library.remove(item.id)).toBe(true);
    expect(await library.remove(item.id)).toBe(false);
    expect(await library.get(item.id)).toBeNull();
    expect(await library.file(item.id)).toBeNull();
  });

  it("counts uses", async () => {
    const item = await library.add({ file: file(png(1, 1)), type: "image", title: "a" });

    await library.use(item.id);

    const used = await library.use(item.id);

    expect(used.usageCount).toBe(2);
    expect(used.usedAt).toBeGreaterThan(item.createdAt);
    await expect(library.use("missing")).rejects.toThrow(/No item/);
  });

  it("caches several sized copies per item", async () => {
    const item = await library.add({ file: file(png(512, 512)), type: "sticker", title: "a" });

    await library.storeVariant(item.id, "emoji-48", file(png(48, 48)));
    await library.storeVariant(item.id, "sticker-160", file(png(160, 160)));

    expect((await library.variant(item.id, "emoji-48"))?.size).toBe(png(48, 48).length);
    expect((await library.variant(item.id, "sticker-160"))?.size).toBe(png(160, 160).length);
    expect(await library.variant(item.id, "other")).toBeNull();
    await expect(library.storeVariant("missing", "emoji-48", file(png(1, 1)))).rejects.toThrow(/No item/);
  });

  it("removes several items at once, telling which existed", async () => {
    const a = await library.add({ file: file(png(1, 1)), type: "image", title: "a" });
    const b = await library.add({ file: file(png(2, 2)), type: "image", title: "b" });
    const c = await library.add({ file: file(png(3, 3)), type: "image", title: "c" });

    expect(await library.removeMany([a.id, "missing", b.id, a.id])).toEqual([a.id, b.id]);
    expect((await library.list()).map(item => item.id)).toEqual([c.id]);
    expect(await library.file(a.id)).toBeNull();
    expect(await library.removeMany([])).toEqual([]);
  });
});

describe("cache", () => {
  it("measures the sized copies, and clearing them keeps every original", async () => {
    const a = await library.add({ file: file(png(512, 512)), type: "sticker", title: "a" });
    const b = await library.add({ file: file(png(64, 64)), type: "emoji", title: "b" });
    const copies = png(48, 48).length + png(160, 160).length + png(32, 32).length;

    expect(await library.cacheUsage()).toEqual({ size: 0, count: 0 });

    await library.storeVariant(a.id, "emoji-48", file(png(48, 48)));
    await library.storeVariant(a.id, "sticker-160", file(png(160, 160)));
    await library.storeVariant(b.id, "emoji-32", file(png(32, 32)));

    expect(await library.cacheUsage()).toEqual({ size: copies, count: 3 });
    expect(await library.clearCache()).toEqual({ size: copies, count: 3 });
    expect(await library.cacheUsage()).toEqual({ size: 0, count: 0 });
    expect(await library.variant(a.id, "emoji-48")).toBeNull();

    // The originals and items are untouched.
    expect((await library.file(a.id))?.size).toBe(png(512, 512).length);
    expect((await library.file(b.id))?.size).toBe(png(64, 64).length);
    expect(await library.list()).toHaveLength(2);
    expect(await library.clearCache()).toEqual({ size: 0, count: 0 });
  });
});

describe("fingerprints that cannot be made", () => {
  it("are left out, without stopping an item from being added", async () => {
    const failing = createLibrary(db, steppingClock(), async () => {
      throw new Error("Cannot decode.");
    });
    const item = await failing.add({ file: file(png(8, 8)), type: "emoji", title: "plain" });

    expect(item.title).toBe("plain");
    expect((await db.items.get(item.id))?.fingerprint).toBeNull();
  });
});

describe("favorites", () => {
  it("are set and taken back by an update", async () => {
    const item = await library.add({ file: file(png(4, 4)), type: "emoji", title: "wave", favorite: true });

    expect((await library.update(item.id, { favorite: false })).favorite).toBe(false);
    expect((await library.update(item.id, { favorite: true })).favorite).toBe(true);
  });
});

describe("duplicates", () => {
  const RED = "0123456789abcdefff0000";

  it("groups the same files and near-identical images, fingerprinting older items once", async () => {
    const fingerprint = vi.fn(async () => RED);
    const finder = createLibrary(db, steppingClock(), fingerprint);
    const a = await finder.add({ file: file(png(64, 64)), type: "emoji", title: "a" });
    const big = await finder.add({ file: file(png(128, 128)), type: "sticker", title: "big" });
    const copy = await finder.add({ file: file(png(64, 64)), type: "emoji", title: "copy" });
    const wide = await finder.add({ file: file(png(64, 32)), type: "emoji", title: "wide" });

    expect(await finder.duplicates()).toEqual([{ ids: [big.id, a.id, copy.id], exact: false }]);
    expect(fingerprint).toHaveBeenCalledTimes(4);

    // An item from before fingerprints gets one when duplicates are looked for, and only then.
    await db.items.update(wide.id, { fingerprint: undefined });
    await finder.duplicates();
    await finder.duplicates();
    expect(fingerprint).toHaveBeenCalledTimes(5);
    expect((await db.items.get(wide.id))?.fingerprint).toBe(RED);
  });

  it("finds the item an image about to be added looks like, fingerprinting older items first", async () => {
    const finder = createLibrary(db, steppingClock(), async () => RED);
    const loaf = await finder.add({ file: file(png(64, 64)), type: "emoji", title: "loaf" });

    await db.items.update(loaf.id, { fingerprint: undefined });
    expect(await finder.similar({ fingerprint: RED, width: 48, height: 48 })).toMatchObject({ id: loaf.id, title: "loaf" });
    expect(await finder.similar({ fingerprint: RED, width: 96, height: 48 })).toBeNull();
    expect(await finder.similar({ fingerprint: "fedcba9876543210ff0000", width: 48, height: 48 })).toBeNull();
  });

  it("leaves an item with no file unfingerprinted, and one replaced while it was read as it is now", async () => {
    let target = "";
    const fingerprint = vi.fn(async () => {
      // The file is replaced while its old one is being looked at.
      await db.items.update(target, { hash: "replaced" });

      return RED;
    });
    const finder = createLibrary(db, steppingClock(), fingerprint);
    const lost = await finder.add({ file: file(png(64, 64)), type: "emoji", title: "lost" });
    const swapped = await finder.add({ file: file(png(32, 32)), type: "emoji", title: "swapped" });

    await db.items.update(lost.id, { fingerprint: undefined });
    await db.items.update(swapped.id, { fingerprint: undefined });
    await db.blobs.delete(lost.id);
    target = swapped.id;
    fingerprint.mockClear();

    await finder.duplicates();
    expect(fingerprint).toHaveBeenCalledTimes(1);
    expect((await db.items.get(lost.id))?.fingerprint).toBeNull();
    expect((await db.items.get(swapped.id))?.fingerprint).toBeUndefined();
  });

  it("finds only the same files when images cannot be fingerprinted", async () => {
    const a = await library.add({ file: file(png(64, 64)), type: "emoji", title: "a" });
    const copy = await library.add({ file: file(png(64, 64)), type: "emoji", title: "copy" });

    await library.add({ file: file(png(128, 128)), type: "emoji", title: "big" });
    expect(await library.duplicates()).toEqual([{ ids: [a.id, copy.id], exact: true }]);
  });

  it("keeps one, with the others' tags, favorite, description and sends, and deletes the others", async () => {
    const cats = await tags.add({ name: "Cats" });
    const dogs = await tags.add({ name: "Dogs" });
    const kept = await library.add({ file: file(png(64, 64)), type: "emoji", title: "kept", tags: [cats.id] });
    const other = await library.add({ file: file(png(64, 64)), type: "emoji", title: "other", tags: [dogs.id, cats.id], favorite: true, description: "a cat" });

    await library.use(other.id);
    await library.use(other.id);

    const { item, removed } = await library.merge(kept.id, [other.id, kept.id, "missing"]);

    expect(removed).toEqual([other.id]);
    expect(item).toMatchObject({ id: kept.id, title: "kept", tags: [cats.id, dogs.id], favorite: true, description: "a cat", usageCount: 2 });
    expect(item.usedAt).not.toBeNull();
    expect(await library.get(kept.id)).toEqual(item);
    expect(await library.get(other.id)).toBeNull();
    expect(await library.file(other.id)).toBeNull();
    await expect(library.merge("missing", [kept.id])).rejects.toThrow(/No item/);
  });
});

describe("import and clear", () => {
  it("keeps the id, dates and usage of an imported item", async () => {
    const result = await library.import({
      id: "kept",
      file: file(png(2, 2)),
      type: "gif",
      title: "a",
      createdAt: 5,
      updatedAt: 6,
      usedAt: 7,
      usageCount: 3,
    }, false);

    expect(result).toMatchObject({ status: "added", item: { id: "kept", createdAt: 5, updatedAt: 6, usedAt: 7, usageCount: 3 } });
    expect((await library.file("kept"))?.size).toBe(png(2, 2).length);
  });

  it("gives an item a new id when its own is taken, and skips duplicates only when asked", async () => {
    const first = await library.add({ file: file(png(2, 2)), type: "image", title: "a" });
    const other = await library.import({ id: first.id, file: file(png(3, 3)), type: "image", title: "b" }, true);

    expect(other.item.id).not.toBe(first.id);
    expect(await library.import({ file: file(png(2, 2)), type: "image", title: "again" }, true)).toMatchObject({ status: "skipped", item: { id: first.id } });
    expect((await library.import({ file: file(png(2, 2)), type: "image", title: "again" }, false)).status).toBe("added");
    expect(await library.list()).toHaveLength(3);
  });

  it("clears every item and file", async () => {
    const item = await library.add({ file: file(png(2, 2)), type: "image", title: "a" });

    expect(await library.clear()).toEqual([item.id]);
    expect(await library.list()).toEqual([]);
    expect(await library.file(item.id)).toBeNull();
  });
});
