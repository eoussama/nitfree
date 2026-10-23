import type { TItem } from "~/lib/db";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { png } from "~/lib/media/fixtures";
import { sendMessage } from "~/lib/messaging";
import { startBackground } from "~/test/background";
import { installCanvas } from "~/test/canvas";

import { followLibrary, library } from "./library.svelte";
import { forgetThumbnails, still, STILL_SIZE, thumbnail } from "./thumbnails";
import { deleteWithUndo, flushTrash, pruneTrash, trash, UNDO_DELAY, undoable, undoDelete } from "./trash.svelte";



const wait = (ms = 80) => new Promise(resolve => setTimeout(resolve, ms));

let background: Awaited<ReturnType<typeof startBackground>>;

// Through the background's handlers, as the interface does, so that the change is announced.
async function add(title: string, width = 8): Promise<TItem> {
  return sendMessage("library:add", { file: new Blob([png(width, width)]), type: "emoji", title });
}

beforeEach(async () => {
  background = await startBackground();
  trash.pending = [];
  library.items = [];
  library.tags = [];
  library.packs = [];
  library.loaded = false;
  library.error = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("followLibrary", () => {
  it("loads the library, its tags and packs, and reloads once for a burst of changes", async () => {
    await add("wave");
    await background.tags.add({ name: "Cats" });
    await background.packs.add({ name: "Pets" });

    const stop = followLibrary();

    await wait();
    expect(library).toMatchObject({ loaded: true, error: null });
    expect(library.items.map(item => item.title)).toEqual(["wave"]);
    expect(library.tags.map(tag => tag.name)).toEqual(["Cats"]);
    expect(library.packs.map(pack => pack.name)).toEqual(["Pets"]);

    const list = vi.spyOn(background.library, "list");

    await add("one");
    await add("two");
    await wait(150);
    expect(library.items.map(item => item.title).sort()).toEqual(["one", "two", "wave"]);
    expect(list.mock.calls.length).toBeLessThanOrEqual(2);

    await sendMessage("tags:add", { name: "Dogs" });
    await sendMessage("packs:add", { name: "Wild" });
    await wait(150);
    expect(library.tags).toHaveLength(2);
    expect(library.packs).toHaveLength(2);

    stop();
    await add("late");
    await wait(150);
    expect(library.items.map(item => item.title)).not.toContain("late");
  });

  it("loads once more when a change comes while it loads", async () => {
    await add("wave");

    const list = vi.spyOn(background.library, "list");
    const stop = followLibrary();

    // A change announced while the first load is in flight, and another that finds none loading.
    await sendMessage("tags:add", { name: "Cats" });
    await wait(150);
    await add("two");
    await wait(150);

    expect(library.items).toHaveLength(2);
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(2);
    stop();
  });

  it("says why nothing loaded, and tries again until the background is back", async () => {
    fakeBrowser.reset();

    const stop = followLibrary();

    await wait(50);
    expect(library.loaded).toBe(false);
    expect(library.error).toBeTruthy();

    // The background is back by the first retry, half a second on.
    background = await startBackground();
    await add("wave");
    await wait(650);
    expect(library).toMatchObject({ loaded: true, error: null });
    expect(library.items).toHaveLength(1);
    stop();
  });

  it("stops retrying once the delays are used up, and does nothing after being stopped", async () => {
    vi.useFakeTimers();
    fakeBrowser.reset();

    const stop = followLibrary();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(library.loaded).toBe(false);
    stop();

    fakeBrowser.reset();
    const again = followLibrary();

    again();
    await vi.advanceTimersByTimeAsync(10);
    expect(library.items).toEqual([]);
  });

  it("keeps showing the last library when a reload fails, and drops the load that comes after a stop", async () => {
    await add("wave");

    const stop = followLibrary();

    await wait();
    expect(library.items).toHaveLength(1);

    vi.spyOn(background.library, "list").mockRejectedValue(new Error("Gone."));
    await sendMessage("tags:add", { name: "Cats" });
    await wait(150);
    expect(library).toMatchObject({ loaded: true, error: null });
    expect(library.items).toHaveLength(1);
    stop();
  });
});

describe("trash", () => {
  it("hides a deleted item at once and removes it for good after the undo delay", async () => {
    const item = await add("wave");

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    deleteWithUndo(item);
    deleteWithUndo(item);
    expect(trash.pending).toHaveLength(1);
    expect(undoable()?.id).toBe(item.id);

    await vi.advanceTimersByTimeAsync(UNDO_DELAY);
    expect(trash.pending[0]!.committing).toBe(true);
    expect(undoable()).toBeNull();
    vi.useRealTimers();
    await wait();
    expect(await background.library.list()).toEqual([]);

    // Gone from the library, it is forgotten once the library says so.
    pruneTrash([item]);
    expect(trash.pending).toHaveLength(1);
    pruneTrash([]);
    expect(trash.pending).toEqual([]);
    pruneTrash([]);
  });

  it("brings an item back while it can be undone, and not once it is going", async () => {
    const item = await add("wave");

    deleteWithUndo(item);
    undoDelete("nobody");
    undoDelete(item.id);
    expect(trash.pending).toEqual([]);

    deleteWithUndo(item);
    flushTrash();
    undoDelete(item.id);
    expect(trash.pending[0]!.committing).toBe(true);
    flushTrash();
    await wait();
    expect(await background.library.list()).toEqual([]);
  });

  it("shows an item again when the background cannot remove it", async () => {
    const item = await add("wave");

    vi.spyOn(background.library, "remove").mockRejectedValue(new Error("Locked."));
    deleteWithUndo(item);
    flushTrash();
    await wait();
    expect(trash.pending).toEqual([]);
  });
});

describe("thumbnails", () => {
  beforeEach(() => {
    forgetThumbnails([]);
  });

  it("gets an item's original once and keeps its address until the file changes", async () => {
    const item = await add("wave");
    const file = vi.spyOn(background.library, "file");
    const create = vi.spyOn(URL, "createObjectURL");
    const first = await thumbnail(item);

    expect(first).toMatch(/^blob:/);
    expect(await thumbnail(item)).toBe(first);
    expect(file).toHaveBeenCalledTimes(1);

    // Another file under the same id is another picture.
    expect(await thumbnail({ ...item, hash: "other" })).toMatch(/^blob:/);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("has none for an item whose file is missing, and tries again at the next look", async () => {
    const item = await add("wave");

    vi.spyOn(background.library, "file").mockRejectedValueOnce(new Error("Gone.")).mockResolvedValueOnce(null);
    expect(await thumbnail(item)).toBeNull();
    expect(await thumbnail(item)).toBeNull();
    expect(await thumbnail(item)).toBeNull();
  });

  it("frees the addresses of items that are gone or changed", async () => {
    const [a, b] = [await add("a"), await add("b")];

    // What the earlier tests left to free goes first.
    await wait(20);

    const revoke = vi.spyOn(URL, "revokeObjectURL");

    await thumbnail(a);
    await thumbnail(b);
    forgetThumbnails([a, { ...b, hash: "changed" }]);
    await wait(20);
    expect(revoke).toHaveBeenCalledTimes(1);
    forgetThumbnails([]);
    await wait(20);
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it("uses a small still image as it is, and makes a still of a large or animated one, once", async () => {
    installCanvas();

    const small = await add("small", 8);
    const large = await add("large", STILL_SIZE * 2);
    const smallUrl = await still(small);

    expect(smallUrl).toMatch(/^blob:/);
    expect(await thumbnail(small)).toBe(smallUrl);

    const first = await still(large);
    const made = vi.spyOn(background.library, "file");

    expect(first).toMatch(/^blob:/);
    await wait(30);
    // The still is kept in the library, and comes from there for a page that has none.
    forgetThumbnails([]);
    made.mockClear();
    expect(await still(large)).toMatch(/^blob:/);
    expect(made).not.toHaveBeenCalled();
  });

  it("has no still for an item with no file", async () => {
    installCanvas();

    const large = await add("large", STILL_SIZE * 2);

    vi.spyOn(background.library, "file").mockResolvedValue(null);
    expect(await still(large)).toBeNull();
  });

  it("makes a few stills at a time, the rest waiting their turn", async () => {
    installCanvas();

    const items = await Promise.all(Array.from({ length: 6 }, (_, i) => add(`big${i}`, STILL_SIZE * 2 + i)));
    const urls = await Promise.all(items.map(item => still(item)));

    expect(urls.every(url => url?.startsWith("blob:"))).toBe(true);
  });
});
