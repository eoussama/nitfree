import type { TItem } from "~/lib/db";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";

import { createLibrary, hashBytes } from "~/lib/db/library";
import { createTags } from "~/lib/db/tags";
import { openTestDatabase, steppingClock } from "~/lib/db/testing";
import { png } from "~/test/fixtures";

import { ArchiveError, readArchive, tagsOf, writeArchive } from "./index";



async function setup() {
  const db = await openTestDatabase();
  const library = createLibrary(db, steppingClock());
  const tags = createTags(db, steppingClock());

  return { library, tags };
}

async function pack(items: TItem[], tagList: Awaited<ReturnType<ReturnType<typeof createTags>["list"]>>, files: Map<string, Uint8Array>) {
  return writeArchive({
    items,
    tags: tagList,
    appVersion: "0.3.0",
    readFile: async item => files.get(item.id) ?? null,
  });
}

describe("writeArchive, in detail", () => {
  let hash = "";

  beforeAll(async () => {
    hash = await hashBytes(png(1, 1));
  });

  const entry = (id: string, packs: string[]) => ({
    id,
    type: "emoji",
    title: id,
    description: "",
    tags: [],
    packs,
    favorite: false,
    hash,
    size: png(1, 1).length,
    format: "png",
    mime: "image/png",
    width: 1,
    height: 1,
    animated: false,
    createdAt: 1,
    updatedAt: 1,
    usedAt: null,
    usageCount: 0,
  }) as unknown as TItem;
  const write = (items: TItem[], packs: { id: string; name: string; icon: string | null; createdAt: number }[]) =>
    writeArchive({ items, tags: [], packs, appVersion: "1", readFile: async () => png(1, 1) });

  it("keeps a pack's icon only for an item that is in the archive and in the pack", async () => {
    const packs = [
      { id: "p", name: "P", icon: "a", createdAt: 1 },
      { id: "q", name: "Q", icon: "a", createdAt: 1 },
      { id: "r", name: "R", icon: "gone", createdAt: 1 },
    ];
    const read = await readArchive(await write([entry("a", ["p"])], packs));

    expect(read.kind).toBe("nitfree");
    expect(read.packs.map(found => [found.name, found.icon])).toEqual([["P", "a"], ["Q", null], ["R", null]]);
  });

  it("says which item is missing from the library, and writes the packs of the items that are listed", async () => {
    await expect(writeArchive({ items: [entry("a", [])], tags: [], appVersion: "1", readFile: async () => null })).rejects.toMatchObject({
      reason: "notInLibrary",
      message: "The file of \"a\" is missing from the library",
      params: { title: "a" },
    });

    const parsed = await readArchive(await write([entry("a", ["p", "unlisted"])], [{ id: "p", name: "P", icon: null, createdAt: 1 }]));

    expect(parsed.entries[0]!.packs).toEqual(["P"]);
  });

  it("writes a pack's icon only for an item that is in the archive and in the pack, in the file itself", async () => {
    const packs = [
      { id: "p", name: "P", icon: "a", createdAt: 1 },
      { id: "q", name: "Q", icon: "a", createdAt: 1 },
      { id: "r", name: "R", icon: "b", createdAt: 1 },
    ];
    const files = unzipSync(await write([entry("a", ["p"]), entry("b", [])], packs));
    const library = JSON.parse(strFromU8(files["library.json"]!)) as { packs: { icon: string | null }[] };

    expect(library.packs.map(found => found.icon)).toEqual(["a", null, null]);
  });

  it("stores the files as they are, and deflates the rest", async () => {
    const big = new Uint8Array(20_000);
    const archive = await writeArchive({ items: [entry("a", [])], tags: [], settings: { clickAction: "send" } as never, appVersion: "1", readFile: async () => big });
    const files = unzipSync(archive);

    // Stored, the file takes its whole size; deflated, zeros take a few bytes.
    expect(archive.length).toBeGreaterThan(big.length);
    expect(Object.keys(files).sort()).toEqual(["files/a.png", "library.json", "manifest.json", "settings.json"]);
    expect(JSON.parse(strFromU8(files["settings.json"]!))).toEqual({ clickAction: "send" });
  });

  it("names the error as what it is", () => {
    expect(new ArchiveError("empty", "x").name).toBe("ArchiveError");
  });
});

describe("archive", () => {
  it("round-trips items, tags and favorites", async () => {
    const { library, tags } = await setup();
    const tag = await tags.add({ name: "Cats", color: "#fff" });
    const bytes = png(4, 4);
    const item = await library.add({ file: new Blob([bytes]), type: "sticker", title: "Loaf", tags: [tag.id], favorite: true });
    const archive = await pack([item], await tags.list(), new Map([[item.id, bytes]]));
    const parsed = await readArchive(archive);

    expect(parsed.kind).toBe("nitfree");
    expect(parsed.tags).toEqual([expect.objectContaining({ name: "Cats", color: "#fff" })]);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({ id: item.id, title: "Loaf", type: "sticker", tags: ["Cats"], favorite: true, hash: item.hash });
    expect(parsed.entries[0]?.bytes).toEqual(new Uint8Array(bytes));
  });

  it("keeps only the tags a selection uses", async () => {
    const { library, tags } = await setup();
    const used = await tags.add({ name: "used" });

    await tags.add({ name: "unused" });

    const item = await library.add({ file: new Blob([png(2, 2)]), type: "emoji", title: "a", tags: [used.id] });

    expect(tagsOf([item], await tags.list())).toEqual([used]);
  });

  it("reports progress and refuses an item whose file is gone", async () => {
    const { library } = await setup();
    const item = await library.add({ file: new Blob([png(2, 2)]), type: "emoji", title: "a" });
    const progress: number[][] = [];

    await writeArchive({
      items: [item],
      tags: [],
      appVersion: "0.3.0",
      readFile: async () => png(2, 2),
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(progress).toEqual([[1, 1]]);

    await expect(pack([item], [], new Map())).rejects.toMatchObject({ reason: "notInLibrary", params: { title: "a" } });
  });

  it("rejects files that are not archives", async () => {
    await expect(readArchive(strToU8("not a zip"))).rejects.toMatchObject({ code: "corrupt", reason: "notZip" });
  });

  it("rejects a newer format and malformed JSON", async () => {
    const newer = zipSync({
      "manifest.json": strToU8(JSON.stringify({ format: "nitfree", version: 99, appVersion: "9", exportedAt: 1 })),
      "library.json": strToU8(JSON.stringify({ items: [], tags: [] })),
    });

    await expect(readArchive(newer)).rejects.toMatchObject({ code: "unsupported", reason: "newer", params: { version: "99" } });

    const broken = zipSync({ "manifest.json": strToU8("{"), "library.json": strToU8("{}") });

    await expect(readArchive(broken)).rejects.toBeInstanceOf(ArchiveError);

    const invalid = zipSync({
      "manifest.json": strToU8(JSON.stringify({ format: "other" })),
      "library.json": strToU8("{}"),
    });

    await expect(readArchive(invalid)).rejects.toMatchObject({ code: "invalid", reason: "invalid", params: { name: "manifest.json" } });
  });

  it("rejects a file that was altered after export", async () => {
    const { library } = await setup();
    const bytes = png(4, 4);
    const item = await library.add({ file: new Blob([bytes]), type: "emoji", title: "a" });
    const archive = await pack([item], [], new Map([[item.id, bytes]]));
    // A different image of the same size would pass a size check but not the hash.
    const altered = new Uint8Array(bytes);

    altered[altered.length - 20] = (altered[altered.length - 20] ?? 0) ^ 0xFF;

    const parsed = await readArchive(archive);

    expect(parsed.entries).toHaveLength(1);

    const { unzipSync } = await import("fflate");
    const files = unzipSync(archive);
    const path = Object.keys(files).find(name => name.startsWith("files/"))!;
    const tampered = zipSync({ ...files, [path]: altered });

    await expect(readArchive(tampered)).rejects.toMatchObject({ code: "corrupt", reason: "mismatch", params: { title: "a" } });
  });

  it("reads a plain zip of images, with folders as tags and file names as titles", async () => {
    const zip = zipSync({
      "cats/happy_cat.png": png(3, 3),
      "cats/memes/grumpy-cat.png": png(4, 4),
      "readme.txt": strToU8("hello"),
      "__MACOSX/cats/._happy_cat.png": png(3, 3),
    });
    const parsed = await readArchive(zip);

    expect(parsed.kind).toBe("images");
    expect(parsed.ignored).toBe(1);
    expect(parsed.entries.map(({ title, tags, type }) => ({ title, tags, type }))).toEqual([
      { title: "happy cat", tags: ["cats"], type: "image" },
      { title: "grumpy cat", tags: ["cats", "memes"], type: "image" },
    ]);
    expect(parsed.tags.map(tag => tag.name)).toEqual(["cats", "memes"]);
  });

  it("rejects a zip with no usable images", async () => {
    await expect(readArchive(zipSync({ "a.txt": strToU8("x") }))).rejects.toMatchObject({ code: "empty", reason: "empty" });
  });
});
