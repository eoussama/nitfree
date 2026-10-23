import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { hashBytes } from "~/lib/db/library";
import { png } from "~/lib/media/fixtures";

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
 * @param parts.library - The library.json content.
 * @param parts.files - The other files, by path.
 * @returns The zip's bytes.
 */
async function archive(parts: { library?: unknown; files?: Record<string, Uint8Array | null> } = {}): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify({ format: "nitfree", version: 1, appVersion: "0.4.0", exportedAt: 1 })),
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
