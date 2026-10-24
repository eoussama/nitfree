import type { TItem } from "~/lib/db";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onEvent, sendMessage } from "~/lib/messaging";

import { followLibrary, library } from "./library.svelte";
import { forgetThumbnails } from "./thumbnails";
import { pruneTrash } from "./trash.svelte";



vi.mock("~/lib/messaging", async original => ({ ...await original<object>(), sendMessage: vi.fn(), onEvent: vi.fn() }));
vi.mock("./thumbnails", () => ({ forgetThumbnails: vi.fn() }));
vi.mock("./trash.svelte", () => ({ pruneTrash: vi.fn() }));

const send = vi.mocked(sendMessage);
const listeners = new Map<string, () => void>();
const unsubscribed: string[] = [];
const item = (id: string) => ({ id }) as TItem;

// Each load asks for three lists; this counts the loads.
const loads = () => send.mock.calls.filter(([name]) => name === "library:list").length;

let items: TItem[];
let failing: number;
let pending: Array<() => void> | null;

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(library, { items: [], tags: [], packs: [], loaded: false, error: null });
  items = [item("a")];
  failing = 0;
  pending = null;
  listeners.clear();
  unsubscribed.length = 0;
  send.mockReset().mockImplementation((async (name: string) => {
    if (pending) {
      await new Promise<void>(resolve => pending!.push(resolve));
    }

    if (failing > 0) {
      if (name === "packs:list") {
        failing--;
      }

      throw new Error("Restarting.");
    }

    return name === "library:list" ? items : [];
  }) as never);
  vi.mocked(onEvent).mockReset().mockImplementation(((name: string, listener: () => void) => {
    listeners.set(name, listener);

    return () => void unsubscribed.push(name);
  }) as never);
  vi.mocked(forgetThumbnails).mockClear();
  vi.mocked(pruneTrash).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("followLibrary, load by load", () => {
  it("loads once to start, and lets the thumbnails and trash know what is listed", async () => {
    const stop = followLibrary();

    await vi.advanceTimersByTimeAsync(0);
    expect(loads()).toBe(1);
    expect(library).toMatchObject({ items, loaded: true });
    expect(forgetThumbnails).toHaveBeenCalledWith(items);
    expect(pruneTrash).toHaveBeenCalledWith(items);
    stop();
  });

  it("reloads once for a burst of changes to items, tags or packs, after they settle", async () => {
    const stop = followLibrary();

    await vi.advanceTimersByTimeAsync(0);

    for (const name of ["library:changed", "tags:changed", "packs:changed"]) {
      listeners.get(name)!();
      await vi.advanceTimersByTimeAsync(20);
    }

    expect(loads()).toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    expect(loads()).toBe(2);
    stop();
  });

  it("makes one more load for changes while it loads, not another at the same time", async () => {
    pending = [];

    const stop = followLibrary();

    await vi.advanceTimersByTimeAsync(0);
    listeners.get("library:changed")!();
    listeners.get("library:changed")!();
    await vi.advanceTimersByTimeAsync(50);
    listeners.get("library:changed")!();
    await vi.advanceTimersByTimeAsync(50);
    expect(loads()).toBe(1);

    const first = pending;

    pending = null;
    first.forEach(resolve => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(loads()).toBe(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(loads()).toBe(2);
    stop();
  });

  it("does not keep a failed load that changes came in during, and loads those changes", async () => {
    pending = [];
    failing = 1;

    const stop = followLibrary();

    await vi.advanceTimersByTimeAsync(0);
    listeners.get("library:changed")!();
    await vi.advanceTimersByTimeAsync(50);

    const first = pending;

    pending = null;
    first.forEach(resolve => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(library).toMatchObject({ loaded: true, error: null });
    // The retry the failure would have made is not needed.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(loads()).toBe(2);
    stop();
  });

  it("retries a failed load with longer and longer waits, and drops a retry a change made needless", async () => {
    failing = 2;

    const stop = followLibrary();

    await vi.advanceTimersByTimeAsync(0);
    expect(library.error).toBe("Restarting.");
    await vi.advanceTimersByTimeAsync(500);
    expect(loads()).toBe(2);
    // The second wait is longer than the first.
    await vi.advanceTimersByTimeAsync(500);
    expect(loads()).toBe(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(loads()).toBe(3);
    expect(library.loaded).toBe(true);

    // A failure, then a change that loads before the retry: the retry is dropped.
    failing = 1;
    listeners.get("library:changed")!();
    await vi.advanceTimersByTimeAsync(50);
    expect(loads()).toBe(4);
    listeners.get("library:changed")!();
    await vi.advanceTimersByTimeAsync(50);
    expect(loads()).toBe(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(loads()).toBe(5);
    stop();
  });

  it("stops listening, waiting and retrying, and keeps nothing a load finishes with after", async () => {
    pending = [];

    const stop = followLibrary();

    await vi.advanceTimersByTimeAsync(0);
    listeners.get("library:changed")!();
    stop();

    const first = pending;

    pending = null;
    first.forEach(resolve => resolve());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(library.loaded).toBe(false);
    expect(loads()).toBe(1);
    expect(unsubscribed).toEqual(["library:changed", "tags:changed", "packs:changed"]);
    expect(forgetThumbnails).toHaveBeenLastCalledWith([]);
  });

  it("stops a retry that was waiting", async () => {
    failing = 1;

    const stop = followLibrary();

    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(loads()).toBe(1);
  });
});
