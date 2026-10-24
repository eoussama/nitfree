import type { TItem } from "~/lib/db";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMessage } from "~/lib/messaging";

import { deleteWithUndo, flushTrash, pruneTrash, trash, UNDO_DELAY, undoable, undoDelete } from "./trash.svelte";



vi.mock("~/lib/messaging", async original => ({ ...await original<object>(), sendMessage: vi.fn(async () => undefined) }));

const send = vi.mocked(sendMessage);
const item = (id: string) => ({ id, title: id }) as TItem;
const ids = () => trash.pending.map(pending => [pending.item.id, pending.committing]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  trash.pending = [];
  send.mockReset().mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trash, with several deletions at once", () => {
  it("keeps each deletion apart, and makes each final after its own delay", async () => {
    deleteWithUndo(item("a"));
    await vi.advanceTimersByTimeAsync(UNDO_DELAY / 2);
    deleteWithUndo(item("b"));
    expect(ids()).toEqual([["a", false], ["b", false]]);
    expect(undoable()?.id).toBe("b");

    await vi.advanceTimersByTimeAsync(UNDO_DELAY / 2);
    expect(ids()).toEqual([["a", true], ["b", false]]);
    expect(send.mock.calls).toEqual([["library:remove", { id: "a" }]]);
    expect(undoable()?.id).toBe("b");

    await vi.advanceTimersByTimeAsync(UNDO_DELAY / 2);
    expect(ids()).toEqual([["a", true], ["b", true]]);
    expect(undoable()).toBeNull();
  });

  it("brings back only the item it is asked to", () => {
    deleteWithUndo(item("a"));
    deleteWithUndo(item("b"));
    deleteWithUndo(item("c"));
    undoDelete("b");
    expect(ids()).toEqual([["a", false], ["c", false]]);
    expect(undoable()?.id).toBe("c");
  });

  it("shows again only the item the background could not remove", async () => {
    send.mockImplementation((async (_: string, data: { id: string }) => {
      if (data.id === "a") {
        throw new Error("Locked.");
      }
    }) as never);
    deleteWithUndo(item("a"));
    deleteWithUndo(item("b"));
    flushTrash();
    await vi.advanceTimersByTimeAsync(0);
    expect(ids()).toEqual([["b", true]]);
  });

  it("gives an item deleted again its whole delay, whether it was brought back or failed to go", async () => {
    deleteWithUndo(item("a"));
    await vi.advanceTimersByTimeAsync(UNDO_DELAY - 1000);
    undoDelete("a");
    deleteWithUndo(item("a"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(ids()).toEqual([["a", false]]);

    trash.pending = [];
    send.mockRejectedValueOnce(new Error("Locked."));
    deleteWithUndo(item("b"));
    await vi.advanceTimersByTimeAsync(UNDO_DELAY - 1000);
    flushTrash();
    await vi.advanceTimersByTimeAsync(0);
    expect(ids()).toEqual([]);
    deleteWithUndo(item("b"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(ids()).toEqual([["b", false]]);
  });

  it("forgets only the removed items the library no longer lists", () => {
    deleteWithUndo(item("a"));
    deleteWithUndo(item("b"));
    deleteWithUndo(item("c"));
    flushTrash();
    deleteWithUndo(item("d"));

    pruneTrash([item("b"), item("x")]);
    expect(ids()).toEqual([["b", true], ["d", false]]);

    // Nothing gone: nothing changes, not even the list itself.
    const before = trash.pending;

    pruneTrash([item("b")]);
    expect(trash.pending).toBe(before);
  });
});
