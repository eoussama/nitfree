import type { TNotify } from "./handlers";

import type { THandlers } from "~/lib/messaging";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { png } from "~/lib/media/fixtures";

import { createLibraryHandlers } from "./handlers";
import { createLibrary } from "./library";
import { createTags } from "./tags";
import { openTestDatabase } from "./testing";



const sender: Browser.runtime.MessageSender = {};

let handlers: Partial<THandlers>;
let notify: ReturnType<typeof vi.fn<TNotify>>;

beforeEach(async () => {
  const db = await openTestDatabase();

  notify = vi.fn<TNotify>(async () => undefined);
  handlers = createLibraryHandlers(createLibrary(db), createTags(db), notify);
});

describe("library handlers", () => {
  it("route every library request and announce each change", async () => {
    const item = await handlers["library:add"]!({ file: new Blob([png(4, 4)]), type: "emoji", title: "wave" }, sender);

    expect(notify).toHaveBeenLastCalledWith("library:changed", { change: "added", ids: [item.id] });
    expect(await handlers["library:list"]!(undefined, sender)).toEqual([item]);
    expect(await handlers["library:get"]!({ id: item.id }, sender)).toEqual(item);
    expect((await handlers["library:file"]!({ id: item.id }, sender))?.size).toBe(png(4, 4).length);

    // Sized copies are stored and read back, silently.
    expect(await handlers["library:variant"]!({ id: item.id, key: "emoji-48" }, sender)).toBeNull();
    await handlers["library:storeVariant"]!({ id: item.id, key: "emoji-48", file: new Blob([png(2, 2)]) }, sender);
    expect((await handlers["library:variant"]!({ id: item.id, key: "emoji-48" }, sender))?.size).toBe(png(2, 2).length);
    expect(notify).toHaveBeenCalledTimes(1);

    await handlers["library:update"]!({ id: item.id, patch: { title: "hi" } }, sender);
    expect(notify).toHaveBeenLastCalledWith("library:changed", { change: "updated", ids: [item.id] });

    await handlers["library:use"]!({ id: item.id }, sender);
    expect(notify).toHaveBeenLastCalledWith("library:changed", { change: "updated", ids: [item.id] });

    expect(await handlers["library:remove"]!({ id: item.id }, sender)).toBe(true);
    expect(notify).toHaveBeenLastCalledWith("library:changed", { change: "removed", ids: [item.id] });
    expect(notify).toHaveBeenCalledTimes(4);
  });

  it("announce nothing when nothing changed", async () => {
    expect(await handlers["library:remove"]!({ id: "missing" }, sender)).toBe(false);
    await expect(handlers["library:update"]!({ id: "missing", patch: {} }, sender)).rejects.toThrow(/No item/);
    expect(notify).not.toHaveBeenCalled();
  });

  it("announce tag changes, and item changes when removing a tag touches items", async () => {
    const tag = await handlers["tags:add"]!({ name: "Cats" }, sender);

    expect(notify).toHaveBeenLastCalledWith("tags:changed", { change: "added", ids: [tag.id] });

    const item = await handlers["library:add"]!({ file: new Blob([png(1, 1)]), type: "image", title: "x", tags: [tag.id] }, sender);

    await handlers["tags:update"]!({ id: tag.id, patch: { color: "#000000" } }, sender);
    expect(notify).toHaveBeenLastCalledWith("tags:changed", { change: "updated", ids: [tag.id] });
    expect(await handlers["tags:list"]!(undefined, sender)).toHaveLength(1);

    await handlers["tags:remove"]!({ id: tag.id }, sender);
    expect(notify).toHaveBeenCalledWith("tags:changed", { change: "removed", ids: [tag.id] });
    expect(notify).toHaveBeenLastCalledWith("library:changed", { change: "updated", ids: [item.id] });
  });

  it("announce imports, and only the tags an import creates", async () => {
    const tag = await handlers["tags:ensure"]!({ name: "Cats" }, sender);

    expect(notify).toHaveBeenLastCalledWith("tags:changed", { change: "added", ids: [tag.id] });
    expect(await handlers["tags:ensure"]!({ name: "cats" }, sender)).toEqual(tag);
    expect(notify).toHaveBeenCalledTimes(1);

    const item = await handlers["library:import"]!({ item: { id: "kept", file: new Blob([png(2, 2)]), type: "emoji", title: "a", tags: [tag.id] }, skipDuplicates: true }, sender);

    expect(item?.id).toBe("kept");
    expect(notify).toHaveBeenLastCalledWith("library:changed", { change: "added", ids: ["kept"] });

    // A duplicate is skipped, silently.
    expect(await handlers["library:import"]!({ item: { file: new Blob([png(2, 2)]), type: "emoji", title: "b" }, skipDuplicates: true }, sender)).toBeNull();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("clear the library and its tags, announcing both, or nothing when already empty", async () => {
    await handlers["library:clear"]!(undefined, sender);
    expect(notify).not.toHaveBeenCalled();

    const tag = await handlers["tags:add"]!({ name: "a" }, sender);
    const item = await handlers["library:add"]!({ file: new Blob([png(2, 2)]), type: "emoji", title: "a", tags: [tag.id] }, sender);

    notify.mockClear();
    await handlers["library:clear"]!(undefined, sender);

    expect(notify).toHaveBeenCalledWith("library:changed", { change: "removed", ids: [item.id] });
    expect(notify).toHaveBeenCalledWith("tags:changed", { change: "removed", ids: [tag.id] });
    expect(await handlers["library:list"]!(undefined, sender)).toEqual([]);
    expect(await handlers["tags:list"]!(undefined, sender)).toEqual([]);
  });

  it("announce items removed together once, and clear the cache silently", async () => {
    const a = await handlers["library:add"]!({ file: new Blob([png(2, 2)]), type: "emoji", title: "a" }, sender);
    const b = await handlers["library:add"]!({ file: new Blob([png(3, 3)]), type: "emoji", title: "b" }, sender);

    await handlers["library:storeVariant"]!({ id: a.id, key: "emoji-48", file: new Blob([png(1, 1)]) }, sender);
    expect(await handlers["library:cacheUsage"]!(undefined, sender)).toEqual({ size: png(1, 1).length, count: 1 });

    notify.mockClear();
    expect(await handlers["library:clearCache"]!(undefined, sender)).toEqual({ size: png(1, 1).length, count: 1 });
    expect(notify).not.toHaveBeenCalled();

    expect(await handlers["library:removeMany"]!({ ids: [a.id, b.id, "missing"] }, sender)).toEqual([a.id, b.id]);
    expect(notify).toHaveBeenCalledExactlyOnceWith("library:changed", { change: "removed", ids: [a.id, b.id] });

    expect(await handlers["library:removeMany"]!({ ids: ["missing"] }, sender)).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("find duplicates silently, and announce a merge as the kept item updated and the others removed", async () => {
    const kept = await handlers["library:add"]!({ file: new Blob([png(2, 2)]), type: "emoji", title: "a" }, sender);
    const copy = await handlers["library:add"]!({ file: new Blob([png(2, 2)]), type: "emoji", title: "b" }, sender);

    notify.mockClear();
    expect(await handlers["library:duplicates"]!(undefined, sender)).toEqual([{ ids: [kept.id, copy.id], exact: true }]);
    expect(notify).not.toHaveBeenCalled();

    expect((await handlers["library:merge"]!({ keep: kept.id, remove: [copy.id] }, sender)).id).toBe(kept.id);
    expect(notify).toHaveBeenCalledWith("library:changed", { change: "updated", ids: [kept.id] });
    expect(notify).toHaveBeenLastCalledWith("library:changed", { change: "removed", ids: [copy.id] });
    expect(await handlers["library:list"]!(undefined, sender)).toHaveLength(1);
  });

  it("still answers when an announcement fails", async () => {
    notify.mockRejectedValue(new Error("no receivers"));

    const item = await handlers["library:add"]!({ file: new Blob([png(1, 1)]), type: "image", title: "x" }, sender);

    expect(item.title).toBe("x");
  });
});
