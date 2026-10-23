import type { TParsedArchive } from "~/lib/archive";
import type { TItem } from "~/lib/db";

import { unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readArchive } from "~/lib/archive";
import { accentColor, autocomplete, clickAction, colorTheme, cssSnippets, playAnimations, sendSizes, shortcut, shortcutKeys, suggestionsAt } from "~/lib/settings";
import { DEFAULT_SHORTCUT } from "~/lib/shortcut";
import { startBackground } from "~/test/background";
import { gif, png } from "~/test/fixtures";

import { download } from "./download";
import { buildExport, fileNameOf, saveItem, saveItems } from "./export";
import { library } from "./library.svelte";
import { clearNotice, notice } from "./notice.svelte";
import { cancelImport, exportItems, importPending, isArchiveFile, pickFolder, pickImport, transfer } from "./transfer.svelte";



vi.mock("./download", async original => ({ ...await original<object>(), download: vi.fn() }));

const saved = vi.mocked(download);

let background: Awaited<ReturnType<typeof startBackground>>;

async function load(): Promise<void> {
  library.items = await background.library.list();
  library.tags = await background.tags.list();
  library.packs = await background.packs.list();
}

async function seed(): Promise<TItem[]> {
  const cats = await background.tags.add({ name: "Cats" });

  await background.tags.add({ name: "Unused" });

  const pets = await background.packs.add({ name: "Pets" });

  await background.packs.add({ name: "Empty" });

  const a = await background.library.add({ file: new Blob([png(4, 4)]), type: "emoji", title: "wave", tags: [cats.id], packs: [pets.id] });
  const b = await background.library.add({ file: new Blob([gif(8, 8, 2)]), type: "gif", title: "party" });

  await background.packs.update(pets.id, { icon: a.id });
  await load();

  return [a, b];
}

/**
 * The archive last handed to the download.
 *
 * @returns Its files.
 */
async function lastArchive(): Promise<TParsedArchive> {
  const [blob] = saved.mock.lastCall!;

  return readArchive(new Uint8Array(await blob.arrayBuffer()));
}

function folderFile(path: string, bytes: Uint8Array<ArrayBuffer>, name = path.split("/").at(-1)!): File {
  const file = new File([bytes], name);

  Object.defineProperty(file, "webkitRelativePath", { value: path });

  return file;
}

beforeEach(async () => {
  background = await startBackground();
  saved.mockClear();
  clearNotice();
  Object.assign(transfer, { busy: null, task: null, done: 0, total: 0, pending: null, result: null, error: null });
  Object.assign(library, { items: [], tags: [], packs: [], loaded: true, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildExport", () => {
  it("keeps every tag and pack when it exports the library, and only those in use for a part of it", async () => {
    const [a] = await seed();
    const whole = await readArchive(new Uint8Array(await (await buildExport(library.items)).arrayBuffer()));
    const part = await readArchive(new Uint8Array(await (await buildExport([a!])).arrayBuffer()));

    expect(whole.tags.map(tag => tag.name).sort()).toEqual(["Cats", "Unused"]);
    expect(whole.packs.map(pack => pack.name).sort()).toEqual(["Empty", "Pets"]);
    expect(part.tags.map(tag => tag.name)).toEqual(["Cats"]);
    expect(part.packs.map(pack => pack.name)).toEqual(["Pets"]);
  });

  it("exports just the packs it is given, and the settings when asked", async () => {
    await seed();
    await accentColor.setValue("#e91e63");

    const empty = library.packs.find(pack => pack.name === "Empty")!;
    const archive = await readArchive(new Uint8Array(await (await buildExport([], { packs: [empty], withSettings: true })).arrayBuffer()));

    expect(archive.packs.map(pack => pack.name)).toEqual(["Empty"]);
    expect(archive.settings).toMatchObject({ clickAction: "send", accentColor: "#e91e63", snippets: [] });
  });
});

describe("fileNameOf", () => {
  it("names an item's file after it, with its format's usual extension", () => {
    expect(fileNameOf({ title: "a/b", format: "png" } as TItem)).toBe("ab.png");
    expect(fileNameOf({ title: "photo", format: "jpeg" } as TItem)).toBe("photo.jpg");
  });
});

describe("saveItem", () => {
  it("saves an item's original file under its name", async () => {
    const [a] = await seed();

    await saveItem(a!);
    expect(saved).toHaveBeenCalledWith(expect.any(Blob), "wave.png");
  });

  it("says why it could not, when the file is missing or the background fails", async () => {
    const [a] = await seed();

    vi.spyOn(background.library, "file").mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("Gone."));
    await saveItem(a!);
    expect(notice.text).toBe("Could not export: The file of “wave” is missing.");

    await saveItem(a!);
    expect(notice.text).toBe("Could not export: Gone.");
    expect(saved).not.toHaveBeenCalled();
  });
});

describe("saveItems", () => {
  it("does nothing with no items, and saves an archive of the ones given otherwise", async () => {
    await saveItems([]);
    expect(saved).not.toHaveBeenCalled();

    const items = await seed();

    await saveItems(items);
    expect(saved.mock.lastCall![1]).toMatch(/^nitfree-\d{4}-\d{2}-\d{2}\.nitfree$/);
    expect((await lastArchive()).entries).toHaveLength(2);
    expect(notice.text).toBe("Exported 2 items.");
  });

  it("shows its progress for many items, and why it failed", async () => {
    const many = await Promise.all(Array.from({ length: 21 }, (_, i) => background.library.add({ file: new Blob([png(i + 1, 1)]), type: "image", title: `n${i}` })));
    const shown: (string | null)[] = [];
    const file = background.library.file.bind(background.library);

    vi.spyOn(background.library, "file").mockImplementation(async (id) => {
      shown.push(notice.text);

      return file(id);
    });
    await saveItems(many);
    expect(shown.some(text => text?.startsWith("Exporting "))).toBe(true);

    vi.spyOn(background.library, "file").mockResolvedValue(null);
    await saveItems(many);
    expect(notice.text).toBe("Could not export: The file of “n0” is missing from your library.");
  });
});

describe("exportItems", () => {
  it("saves the whole library by default, saying how far it got and how many it saved", async () => {
    await seed();

    expect(await exportItems()).toBe(true);
    expect(transfer).toMatchObject({ busy: null, task: "export", done: 2, total: 2, result: { kind: "export", count: 2 }, error: null });
    expect((await lastArchive()).settings).toBeNull();

    await exportItems(library.items, true);
    expect((await lastArchive()).settings).not.toBeNull();
  });

  it("says why it failed", async () => {
    await seed();
    vi.spyOn(background.library, "file").mockResolvedValue(null);

    expect(await exportItems()).toBe(false);
    expect(transfer).toMatchObject({ busy: null, error: "The file of “party” is missing from your library." });
  });
});

describe("isArchiveFile", () => {
  it("knows a backup or a zip by its name or type", () => {
    expect(isArchiveFile(new File([], "backup.nitfree"))).toBe(true);
    expect(isArchiveFile(new File([], "memes.ZIP"))).toBe(true);
    expect(isArchiveFile(new File([], "download", { type: "application/zip" }))).toBe(true);
    expect(isArchiveFile(new File([], "cat.png", { type: "image/png" }))).toBe(false);
  });
});

describe("pickImport", () => {
  it("reads and checks a file, holding it until it is imported or dropped", async () => {
    await pickImport(new File([zipSync({ "memes/cat.png": png(2, 2) })], "memes.zip"));
    expect(transfer).toMatchObject({ busy: null, task: "import", error: null });
    expect(transfer.pending?.name).toBe("memes.zip");

    cancelImport();
    expect(transfer.pending).toBeNull();
  });

  it("says why a file cannot be imported", async () => {
    await pickImport(new File(["not a zip"], "x.nitfree"));
    expect(transfer).toMatchObject({ busy: null, pending: null, error: "This is not a zip file, or it is damaged." });

    const unreadable = new File([], "gone.nitfree");

    vi.spyOn(unreadable, "arrayBuffer").mockRejectedValue(new Error("Moved."));
    await pickImport(unreadable);
    expect(transfer.error).toBe("This file could not be read.");
  });
});

describe("pickFolder", () => {
  it("reads a folder's images, its subfolders becoming tags, under the folder's name", async () => {
    await pickFolder([folderFile("memes/cats/loaf.png", png(2, 2)), folderFile("memes/dog.png", png(3, 3))]);

    expect(transfer.pending?.name).toBe("memes");
    expect(transfer.pending?.archive.tags.map(tag => tag.name)).toEqual(["cats"]);
    expect(transfer.pending?.archive.entries.map(entry => entry.title).sort()).toEqual(["dog", "loaf"]);
  });

  it("takes a file on its own by its name, and says why a folder cannot be read", async () => {
    await pickFolder([folderFile("", png(2, 2), "solo.png")]);
    expect(transfer.pending?.archive.entries).toHaveLength(1);

    await pickFolder([folderFile("memes/notes.txt", new TextEncoder().encode("hi"))]);
    expect(transfer.error).toBe("This has no images Nitfree accepts (PNG, APNG, GIF, WebP and JPEG).");

    const unreadable = folderFile("memes/cat.png", png(2, 2));

    vi.spyOn(unreadable, "arrayBuffer").mockRejectedValue(new Error("Moved."));
    await pickFolder([unreadable]);
    expect(transfer.error).toBe("This folder could not be read.");
  });
});

describe("importPending", () => {
  it("does nothing with nothing waiting", async () => {
    await importPending("merge", false);
    expect(transfer.task).toBeNull();
  });

  it("adds what the library does not have, or replaces it, saying how many were added", async () => {
    const items = await seed();
    const backup = new Uint8Array(await (await buildExport(items)).arrayBuffer());

    await pickImport(new File([backup], "backup.nitfree"));
    await importPending("merge", false);
    expect(transfer).toMatchObject({ busy: null, pending: null, done: 2, result: { kind: "import", added: 0, skipped: 2, failed: 0 } });

    await background.library.add({ file: new Blob([png(9, 9)]), type: "image", title: "extra" });
    await pickImport(new File([backup], "backup.nitfree"));
    await importPending("replace", false);
    expect(transfer.result).toMatchObject({ added: 2, skipped: 0 });
    expect((await background.library.list()).map(item => item.title).sort()).toEqual(["party", "wave"]);

    // The pack is made again, with the icon it had.
    const wave = (await background.library.list()).find(item => item.title === "wave")!;

    expect((await background.packs.list()).find(pack => pack.name === "Pets")?.icon).toBe(wave.id);
  });

  it("applies the settings in the file when asked, leaving out what this version cannot use", async () => {
    await cssSnippets.setValue([{ id: "mine", name: "Mine", css: "", enabled: true }]);
    transfer.pending = {
      name: "backup.nitfree",
      archive: {
        kind: "nitfree",
        entries: [],
        tags: [],
        packs: [],
        ignored: 0,
        totalSize: 0,
        settings: {
          sendSizes: { emoji: 9999, sticker: 100 },
          clickAction: "add",
          playAnimations: false,
          autocomplete: false,
          suggestionsAt: "start",
          shortcut: false,
          shortcutKeys: { key: "N", ctrl: false, alt: false, shift: false, meta: false },
          colorTheme: "gone",
          accentColor: "#123456",
          snippets: [{ id: "theirs", name: "Theirs", css: "a{}", enabled: false }],
        },
      },
    };

    await importPending("merge", true);

    expect(await sendSizes.getValue()).toEqual({ emoji: 160, sticker: 100 });
    expect(await clickAction.getValue()).toBe("add");
    expect(await playAnimations.getValue()).toBe(false);
    expect(await autocomplete.getValue()).toBe(false);
    expect(await suggestionsAt.getValue()).toBe("start");
    expect(await shortcut.getValue()).toBe(false);
    // A shortcut with no modifier would take typing, and this version has no theme "gone".
    expect(await shortcutKeys.getValue()).toEqual(DEFAULT_SHORTCUT);
    expect(await colorTheme.getValue()).toBeNull();
    expect(await accentColor.getValue()).toBe("#123456");
    expect((await cssSnippets.getValue()).map(snippet => snippet.id)).toEqual(["mine", "theirs"]);
  });

  it("applies the settings an older file has, a theme this version knows, and leaves the rest", async () => {
    const usable = { key: "K", ctrl: true, alt: false, shift: false, meta: false };

    await accentColor.setValue("#abcdef");
    transfer.pending = {
      name: "old.nitfree",
      archive: { kind: "nitfree", entries: [], tags: [], packs: [], ignored: 0, totalSize: 0, settings: { sendSizes: { emoji: 32, sticker: 120 }, clickAction: "send", playAnimations: true, shortcutKeys: usable, colorTheme: "ocean" } },
    };

    await importPending("merge", true);
    expect(await shortcutKeys.getValue()).toEqual(usable);
    expect(await colorTheme.getValue()).toBe("ocean");
    expect(await accentColor.getValue()).toBe("#abcdef");

    transfer.pending = {
      name: "none.nitfree",
      archive: { kind: "nitfree", entries: [], tags: [], packs: [], ignored: 0, totalSize: 0, settings: { sendSizes: { emoji: 32, sticker: 120 }, clickAction: "send", playAnimations: true, colorTheme: null } },
    };
    await importPending("merge", true);
    expect(await colorTheme.getValue()).toBeNull();
  });

  it("leaves the settings alone unless asked, or when the file has none", async () => {
    const backup = zipSync({ "memes/cat.png": png(2, 2) });

    await pickImport(new File([backup], "memes.zip"));
    await importPending("merge", true);
    expect(await clickAction.getValue()).toBe("send");

    transfer.pending = {
      name: "x.nitfree",
      archive: { kind: "nitfree", entries: [], tags: [], packs: [], ignored: 0, totalSize: 0, settings: { sendSizes: { emoji: 32, sticker: 120 }, clickAction: "add", playAnimations: true } },
    };
    await importPending("merge", false);
    expect(await clickAction.getValue()).toBe("send");
  });

  it("says why it failed, keeping the file to try again", async () => {
    const items = await seed();
    const backup = new Uint8Array(await (await buildExport(items)).arrayBuffer());

    expect(Object.keys(unzipSync(backup))).toContain("library.json");
    await pickImport(new File([backup], "backup.nitfree"));
    vi.spyOn(background.library, "clear").mockRejectedValue(new Error("Locked."));
    await importPending("replace", false);
    expect(transfer).toMatchObject({ busy: null, error: "Locked." });
    expect(transfer.pending).not.toBeNull();
  });
});
