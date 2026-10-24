import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { hashBytes } from "~/lib/db/library";
import { png } from "~/test/fixtures";

import { ArchiveError, readArchive } from "./index";
import { packsOf, writeArchive } from "./write";



const bytes = png(4, 4);

async function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "a",
    type: "emoji",
    title: "A",
    description: "",
    tags: [],
    packs: [],
    favorite: false,
    hash: await hashBytes(bytes),
    size: bytes.length,
    format: "png",
    mime: "image/png",
    width: 4,
    height: 4,
    animated: false,
    createdAt: 1,
    updatedAt: 1,
    usedAt: null,
    usageCount: 0,
    file: "files/a.png",
    ...overrides,
  };
}

/**
 * A `.nitfree` file made by hand, so what is wrong with it is the test's to choose.
 *
 * @param parts - What differs from a valid archive: a file replaced, or dropped with null.
 * @param parts.manifest - The manifest.json content.
 * @param parts.library - The library.json content.
 * @param parts.files - The other files, by path.
 * @returns The zip's bytes.
 */
async function archive(parts: { manifest?: unknown; library?: unknown; files?: Record<string, Uint8Array | null> } = {}): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(parts.manifest ?? { format: "nitfree", version: 1, appVersion: "0.4.0", exportedAt: 1 })),
    "files/a.png": bytes,
  };

  if (parts.library !== null) {
    files["library.json"] = strToU8(JSON.stringify(parts.library ?? { items: [await item()], tags: [] }));
  }

  for (const [path, content] of Object.entries(parts.files ?? {})) {
    if (content) {
      files[path] = content;
    }
    else {
      delete files[path];
    }
  }

  return zipSync(files);
}

async function refusal(promise: Promise<unknown>): Promise<ArchiveError> {
  const error = await promise.then(() => null, (reason: unknown) => reason);

  expect(error).toBeInstanceOf(ArchiveError);

  return error as ArchiveError;
}

describe("readArchive of a .nitfree file", () => {
  it("reads a file with no settings, and one whose packs and tags are all listed", async () => {
    const tags = [{ id: "t", name: "Cats", color: null, createdAt: 1 }];
    const packs = [{ id: "p", name: "Pets", icon: "a", createdAt: 1 }];
    const parsed = await readArchive(await archive({ library: { items: [await item({ tags: ["t"], packs: ["p"] })], tags, packs } }));

    expect(parsed.settings).toBeNull();
    expect(parsed.entries[0]).toMatchObject({ tags: ["Cats"], packs: ["Pets"] });
    expect(parsed.packs).toMatchObject([{ name: "Pets", icon: "a" }]);
  });

  it("refuses a file with no library", async () => {
    expect((await refusal(readArchive(await archive({ library: null })))).reason).toBe("noLibrary");
  });

  it("refuses a library that is not even an object, naming the problem without a place", async () => {
    const error = await refusal(readArchive(await archive({ library: 5 })));

    expect(error.reason).toBe("invalid");
    expect(error.params).toMatchObject({ name: "library.json" });
    expect(String(error.params?.problem)).not.toMatch(/^\w+: /);
  });

  it("refuses a library that is wrong at a place, naming it", async () => {
    const error = await refusal(readArchive(await archive({ library: { items: [], tags: "none" } })));

    expect(error.params?.problem).toMatch(/^tags: /);
  });

  it("refuses settings that cannot be read", async () => {
    const error = await refusal(readArchive(await archive({ files: { "settings.json": strToU8("{") } })));

    expect(error).toMatchObject({ reason: "unreadable", params: { name: "settings.json" } });
  });

  it("refuses an item listed twice", async () => {
    const twice = [await item(), await item()];

    expect((await refusal(readArchive(await archive({ library: { items: twice, tags: [] } })))).reason).toBe("duplicate");
  });

  it("refuses an item whose file is missing", async () => {
    expect((await refusal(readArchive(await archive({ files: { "files/a.png": null } })))).reason).toBe("missingFile");
  });

  it("refuses an item with a tag or a pack the file does not list", async () => {
    const withTag = { items: [await item({ tags: ["gone"] })], tags: [] };
    const withPack = { items: [await item({ packs: ["gone"] })], tags: [] };

    expect((await refusal(readArchive(await archive({ library: withTag })))).reason).toBe("unknownTag");
    expect((await refusal(readArchive(await archive({ library: withPack })))).reason).toBe("unknownPack");
  });

  it("drops the icon of a pack that is not one of its items", async () => {
    const packs = [{ id: "p", name: "Pets", icon: "a", createdAt: 1 }];
    const parsed = await readArchive(await archive({ library: { items: [await item()], tags: [], packs } }));

    expect(parsed.packs).toMatchObject([{ name: "Pets", icon: null }]);
  });
});

describe("readArchive refusals, said exactly", () => {
  it("says what is wrong with a file that is not a zip, or that has no library", async () => {
    const notZip = await refusal(readArchive(new Uint8Array([1, 2, 3])));
    const noLibrary = await refusal(readArchive(await archive({ library: null })));

    expect(notZip).toMatchObject({ reason: "notZip", message: "This is not a zip file, or it is damaged" });
    expect(noLibrary).toMatchObject({ reason: "noLibrary", message: "library.json is missing" });
  });

  it("says which file cannot be read, and what is invalid in it", async () => {
    const unreadable = await refusal(readArchive(await archive({ files: { "settings.json": strToU8("{") } })));
    const invalid = await refusal(readArchive(await archive({ library: { items: [], tags: "none" } })));

    expect(unreadable).toMatchObject({ reason: "unreadable", message: "settings.json is not readable", params: { name: "settings.json" } });
    expect(invalid.message).toMatch(/^library\.json is not valid \(tags: .+\)$/);
    expect(invalid.params).toMatchObject({ name: "library.json", problem: expect.stringMatching(/^tags: /) });
  });

  it("says that an archive is from a newer version, and which", async () => {
    const error = await refusal(readArchive(await archive({ manifest: { format: "nitfree", version: 99, appVersion: "9.0.0", exportedAt: 1 } })));

    expect(error).toMatchObject({
      reason: "newer",
      message: "This archive was made by a newer version of Nitfree (format 99)",
      params: { version: "99" },
    });
  });

  it("names the item a problem is with", async () => {
    const twice = await refusal(readArchive(await archive({ library: { items: [await item({ title: "Cat" }), await item({ title: "Cat" })], tags: [] } })));
    const missing = await refusal(readArchive(await archive({ library: { items: [await item({ title: "Cat" })], tags: [] }, files: { "files/a.png": null } })));
    const tag = await refusal(readArchive(await archive({ library: { items: [await item({ title: "Cat", tags: ["x"] })], tags: [] } })));
    const pack = await refusal(readArchive(await archive({ library: { items: [await item({ title: "Cat", packs: ["x"] })], tags: [] } })));

    expect(twice).toMatchObject({ message: "library.json lists \"Cat\" twice", params: { title: "Cat" } });
    expect(missing).toMatchObject({ message: "The file of \"Cat\" is missing from the archive", params: { title: "Cat" } });
    expect(tag).toMatchObject({ message: "\"Cat\" has a tag that the archive does not list", params: { title: "Cat" } });
    expect(pack).toMatchObject({ message: "\"Cat\" is in a pack that the archive does not list", params: { title: "Cat" } });
  });

  it("refuses a file whose size or hash is not what was exported, either alone", async () => {
    const wrongSize = await refusal(readArchive(await archive({ library: { items: [await item({ title: "Cat", size: bytes.length + 1 })], tags: [] } })));
    const wrongHash = await refusal(readArchive(await archive({ library: { items: [await item({ title: "Cat", hash: "0".repeat(64) })], tags: [] } })));

    for (const error of [wrongSize, wrongHash]) {
      expect(error).toMatchObject({ reason: "mismatch", message: "The file of \"Cat\" does not match what was exported", params: { title: "Cat" } });
    }
  });

  it("trims titles, adds up the sizes, and gives the files as they are", async () => {
    const second = png(5, 5);
    const items = [await item({ title: "  Cat  " }), { ...await item({ id: "b", title: "Dog", file: "files/b.png" }), hash: await hashBytes(second), size: second.length }];
    const parsed = await readArchive(await archive({ library: { items, tags: [] }, files: { "files/b.png": second } }));

    expect(parsed.entries.map(entry => entry.title)).toEqual(["Cat", "Dog"]);
    expect(parsed.totalSize).toBe(bytes.length + second.length);
    expect(parsed.entries[0]!.bytes).toEqual(bytes);
  });

  it("drops the icon of a pack when the item it names is not the item in it", async () => {
    const packs = [{ id: "p", name: "Pets", icon: "other", createdAt: 1 }];
    const parsed = await readArchive(await archive({ library: { items: [await item({ packs: ["p"] }), { ...await item({ id: "other", file: "files/other.png" }) }], tags: [], packs }, files: { "files/other.png": bytes } }));

    expect(parsed.packs).toMatchObject([{ icon: null }]);
  });

  it("says when a plain zip has no images", async () => {
    expect(await refusal(readArchive(zipSync({ "a.txt": strToU8("x") })))).toMatchObject({
      reason: "empty",
      message: "This file has no images Nitfree accepts (PNG, APNG, GIF, WebP and JPEG)",
    });
  });

  it("keeps the icon of a pack only for an item that is in that pack", async () => {
    const packs = [{ id: "p", name: "Pets", icon: "a", createdAt: 1 }, { id: "q", name: "Other", icon: "a", createdAt: 1 }];
    const parsed = await readArchive(await archive({ library: { items: [await item({ packs: ["p"] })], tags: [], packs } }));

    expect(parsed.packs.map(pack => [pack.name, pack.icon])).toEqual([["Pets", "a"], ["Other", null]]);
  });
});

describe("readArchive of loose images, in detail", () => {
  const entry = {
    id: null,
    type: "image",
    description: "",
    packs: [],
    favorite: false,
    createdAt: null,
    updatedAt: null,
    usedAt: null,
    usageCount: 0,
  };

  it("makes entries of nothing but what the files give", async () => {
    const parsed = await readArchive(zipSync({ "memes/cat.png": bytes }));

    expect(parsed).toMatchObject({ kind: "images", packs: [], settings: null, ignored: 0, totalSize: bytes.length });
    expect(parsed.entries).toEqual([{ ...entry, title: "cat", tags: ["memes"], hash: await hashBytes(bytes), bytes }]);
    expect(parsed.tags).toEqual([{ id: "memes", name: "memes", color: null, createdAt: 0 }]);
  });

  it("makes titles of file names: no extension, no underscores or dashes, single spaces", async () => {
    const parsed = await readArchive(zipSync({ "a.b__c--d  e.v2.png": bytes, "x  y.png": bytes }));

    expect(parsed.entries.map(found => found.title).sort()).toEqual(["a.b c d e.v2", "x y"]);
  });

  it("reads files in order of their paths, and counts the ones that are not images, with the sizes of those kept", async () => {
    const parsed = await readArchive(zipSync({ "b.png": bytes, "c.txt": strToU8("hello"), "a.png": png(5, 5), "d.txt": strToU8("hi") }));

    expect(parsed.entries.map(found => found.title)).toEqual(["a", "b"]);
    expect(parsed.ignored).toBe(2);
    expect(parsed.totalSize).toBe(bytes.length + png(5, 5).length);
  });

  it("does not take a folder for a file, whatever is in it, or a path with no name", async () => {
    const parsed = await readArchive(zipSync({ "folder.png/": bytes, "/": bytes, "cat.png": bytes }));

    expect(parsed.entries.map(found => found.title)).toEqual(["cat"]);
    expect(parsed.ignored).toBe(0);
  });

  it("makes tags of folder names, trimmed, without blanks, one for names that differ in case, the first spelling kept", async () => {
    const parsed = await readArchive(zipSync({ " Memes /a.png": bytes, "memes/b.png": bytes, "   /c.png": bytes }));

    expect(parsed.tags).toEqual([{ id: "memes", name: "Memes", color: null, createdAt: 0 }]);
    expect(parsed.entries.map(found => found.tags)).toEqual([[], ["Memes"], ["memes"]]);
  });
});

describe("readArchive of loose images", () => {
  it("falls back to the file name for a title when it has no words", async () => {
    const parsed = await readArchive(zipSync({ "_-_.png": bytes }));

    expect(parsed.entries.map(entry => entry.title)).toEqual(["_-_.png"]);
  });

  it("skips folders, empty files and what operating systems leave behind", async () => {
    const parsed = await readArchive(zipSync({
      "memes/": new Uint8Array(),
      "memes/.hidden.png": bytes,
      "__MACOSX/memes/cat.png": bytes,
      "memes/empty.png": new Uint8Array(),
      "memes/cat.png": bytes,
    }));

    expect(parsed.entries.map(entry => entry.title)).toEqual(["cat"]);
    expect(parsed.tags.map(tag => tag.name)).toEqual(["memes"]);
  });
});

describe("packsOf", () => {
  it("keeps the packs that at least one item is in", () => {
    const pack = (id: string) => ({ id, name: id, icon: null, createdAt: 1 });
    const items = [{ packs: ["a"] }, { packs: ["a", "c"] }] as never;

    expect(packsOf(items, [pack("a"), pack("b"), pack("c")]).map(found => found.id)).toEqual(["a", "c"]);
  });
});

describe("writeArchive", () => {
  it("adds the settings when it is given them", async () => {
    const settings = { sendSizes: { emoji: 48, sticker: 160 }, clickAction: "send", playAnimations: true } as const;
    const file = await writeArchive({ items: [], tags: [], settings, appVersion: "0.4.0", readFile: async () => null });

    expect((await readArchive(file)).settings).toEqual(settings);
  });
});
