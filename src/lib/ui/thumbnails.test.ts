// @vitest-environment happy-dom
import type { TItem } from "~/lib/db";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stillImage } from "~/lib/media/resize";
import { sendMessage } from "~/lib/messaging";

import { forgetThumbnails, still, STILL_SIZE, thumbnail, whenVisible } from "./thumbnails";



vi.mock("~/lib/messaging", async original => ({ ...await original<object>(), sendMessage: vi.fn() }));
vi.mock("~/lib/media/resize", async original => ({ ...await original<object>(), stillImage: vi.fn() }));

const send = vi.mocked(sendMessage);
const make = vi.mocked(stillImage);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function item(id: string, patch: Partial<TItem> = {}): TItem {
  return { id, type: "emoji", title: id, description: "", tags: [], packs: [], favorite: false, hash: `h-${id}`, size: 1, format: "png", mime: "image/png", width: 200, height: 200, animated: false, createdAt: 0, updatedAt: 0, usedAt: null, usageCount: 0, ...patch };
}

function answer(handlers: Record<string, (data: never) => unknown>): void {
  send.mockImplementation((async (name: string, data: never) => handlers[name]?.(data)) as never);
}

beforeEach(() => {
  forgetThumbnails([]);
  send.mockReset();
  make.mockReset().mockImplementation(async () => new Blob(["still"]));
  answer({ "library:file": () => new Blob(["file"]), "library:variant": () => null, "library:storeVariant": () => undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("thumbnail and still", () => {
  it("asks again for a file it could not get", async () => {
    let fails = true;

    answer({
      "library:file": () => {
        if (fails) {
          fails = false;
          throw new Error("Restarting.");
        }

        return new Blob(["file"]);
      },
    });

    expect(await thumbnail(item("a"))).toBeNull();
    expect(await thumbnail(item("a"))).toMatch(/^blob:/);
    expect(send.mock.calls.filter(([name]) => name === "library:file")).toHaveLength(2);
  });

  it("uses the original of a still image no larger than a still, by its longest side, and keeps the still by size and file", async () => {
    await still(item("edge", { width: STILL_SIZE, height: 10 }));
    expect(make).not.toHaveBeenCalled();

    await still(item("wide", { width: STILL_SIZE + 1, height: 10 }));
    expect(make).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("library:variant", { id: "wide", key: `still-${STILL_SIZE}-h-wide` });
  });

  it("makes no still of a file that is missing", async () => {
    answer({ "library:file": () => null, "library:variant": () => null });
    expect(await still(item("gone"))).toBeNull();
    expect(make).not.toHaveBeenCalled();
  });

  it("makes three stills at a time, the rest in turn, and has a free turn again once done", async () => {
    let running = 0;
    let most = 0;
    const gates: Array<() => void> = [];

    make.mockImplementation(async () => {
      running++;
      most = Math.max(most, running);
      await new Promise<void>(resolve => gates.push(resolve));
      running--;

      return new Blob(["still"]);
    });

    const urls = Array.from({ length: 5 }, (_, i) => still(item(`big${i}`)));

    await tick();
    expect(running).toBe(3);

    while (gates.length) {
      gates.shift()!();
      await tick();
      await tick();
    }

    expect(await Promise.all(urls)).toHaveLength(5);
    expect(most).toBe(3);

    // Every turn is free again: three more start at once.
    const more = Array.from({ length: 3 }, (_, i) => still(item(`more${i}`)));

    await tick();
    expect(running).toBe(3);
    gates.forEach(open => open());
    await Promise.all(more);
  });
});

describe("whenVisible, in detail", () => {
  class FakeObserver {
    static shared: FakeObserver | null = null;
    observed = new Set<Element>();

    constructor(readonly callback: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
      FakeObserver.shared ??= this;
    }

    observe(element: Element): void {
      this.observed.add(element);
    }

    unobserve(element: Element): void {
      this.observed.delete(element);
    }
  }

  it("watches each element, and asks for idle time once, with a deadline, only when something is due", async () => {
    const idle = vi.fn((callback: () => void) => void setTimeout(callback, 0));

    vi.stubGlobal("IntersectionObserver", FakeObserver);
    vi.stubGlobal("requestIdleCallback", idle);

    const [a, b] = [document.createElement("div"), document.createElement("div")];
    const shown: string[] = [];

    whenVisible(a, () => shown.push("a"));
    whenVisible(b, () => shown.push("b"));

    const observer = FakeObserver.shared!;

    expect([...observer.observed]).toEqual([a, b]);

    observer.callback([{ target: a, isIntersecting: false }]);
    expect(idle).not.toHaveBeenCalled();

    observer.callback([{ target: a, isIntersecting: true }]);
    observer.callback([{ target: b, isIntersecting: true }]);
    expect(idle).toHaveBeenCalledOnce();
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 150 });

    await tick();
    expect(shown).toEqual(["a", "b"]);
    // Nothing left due, nothing more is asked for.
    await tick();
    expect(idle).toHaveBeenCalledOnce();
  });
});
