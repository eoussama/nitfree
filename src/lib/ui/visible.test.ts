// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { whenVisible } from "./thumbnails";



const wait = (ms = 80) => new Promise(resolve => setTimeout(resolve, ms));

describe("whenVisible", () => {
  type TEntry = { target: Element; isIntersecting: boolean };

  class FakeObserver {
    // The one observer every tile shares, made the first time one is watched.
    static shared: FakeObserver | null = null;
    observed = new Set<Element>();

    constructor(readonly callback: (entries: TEntry[]) => void) {
      FakeObserver.shared ??= this;
    }

    observe(element: Element): void {
      this.observed.add(element);
    }

    unobserve(element: Element): void {
      this.observed.delete(element);
    }
  }

  const tiles = (count: number) => Array.from({ length: count }, () => document.body.appendChild(document.createElement("div")));

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });

  it("calls back a few elements at a time, as they come into view, with a timer where the page has no idle time", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);

    const elements = tiles(10);
    const shown: number[] = [];
    const stops = elements.map((element, i) => whenVisible(element, () => shown.push(i)));
    const observer = FakeObserver.shared!;

    observer.callback(elements.map(target => ({ target, isIntersecting: true })));
    await wait(20);
    expect(shown).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    await wait(40);
    expect(shown).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    stops.forEach(stop => stop());
  });

  it("waits for an element that has scrolled out of view again, and for one that is stopped", async () => {
    const idle = vi.fn((callback: () => void) => void setTimeout(callback, 0));

    vi.stubGlobal("requestIdleCallback", idle);

    const [near, far, dropped] = tiles(3);
    const shown: string[] = [];

    whenVisible(near!, () => shown.push("near"));
    whenVisible(far!, () => shown.push("far"));

    const stopDropped = whenVisible(dropped!, () => shown.push("dropped"));
    const { callback } = FakeObserver.shared!;

    callback([{ target: near!, isIntersecting: true }, { target: far!, isIntersecting: true }, { target: dropped!, isIntersecting: true }]);
    callback([{ target: far!, isIntersecting: false }]);
    stopDropped();
    await wait(20);

    expect(shown).toEqual(["near"]);
    expect(idle).toHaveBeenCalled();

    callback([{ target: far!, isIntersecting: true }]);
    await wait(20);
    expect(shown).toEqual(["near", "far"]);
  });
});
