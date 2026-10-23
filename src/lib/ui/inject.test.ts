// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountOverlay, mountPopover, mountSaveMenuItem, mountToggler, watchChatButtonGroups } from "./inject";
import { closePanel, openPanel, panel } from "./panel.svelte";



vi.mock("~/components/Overlay.svelte", () => import("~/test/Stub.svelte"));
vi.mock("~/components/Popover.svelte", () => import("~/test/Stub.svelte"));

const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const group = (id = "g") => `<div class="channelTextArea_x"><div class="buttons_a" id="${id}"><div class="buttonContainer_1"><div role="button" class="button_b"><div class="buttonWrapper_w"></div></div></div></div></div>`;

beforeEach(() => {
  document.body.innerHTML = "";
  closePanel();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mountToggler", () => {
  it("puts the Nitfree button first in the group, with its neighbors' look, and takes it away again", () => {
    document.body.innerHTML = group();

    const target = document.querySelector("#g")!;
    const remove = mountToggler(target);

    flushSync();
    expect(target.firstElementChild?.hasAttribute("data-nitfree-toggler")).toBe(true);
    expect(target.firstElementChild?.className).toContain("buttonContainer_1");

    remove();
    flushSync();
    expect(target.querySelector("[data-nitfree-toggler]")).toBeNull();
  });

  it("goes in an empty group too", () => {
    document.body.innerHTML = "<div id=\"empty\"></div>";

    mountToggler(document.querySelector("#empty")!);
    flushSync();
    expect(document.querySelector("#empty [data-nitfree-toggler]")).not.toBeNull();
  });
});

describe("mountSaveMenuItem", () => {
  it("puts the item before the menu's first group, and calls back when it is chosen", () => {
    document.body.innerHTML = "<div role=\"menu\" id=\"m\"><div role=\"group\"><div role=\"menuitem\" class=\"item_a colorDefault_b\"></div></div></div>";

    const chosen = vi.fn();
    const remove = mountSaveMenuItem(document.querySelector("#m")!, chosen)!;

    flushSync();

    const item = document.querySelector<HTMLElement>("[data-nitfree-save] [role=menuitem]")!;

    expect(document.querySelector("#m")!.firstElementChild?.hasAttribute("data-nitfree-save")).toBe(true);
    item.click();
    expect(chosen).toHaveBeenCalledOnce();

    remove();
    flushSync();
    expect(document.querySelector("[data-nitfree-save]")).toBeNull();
  });

  it("waits for a menu that has no items yet", () => {
    document.body.innerHTML = "<div role=\"menu\" id=\"m\"></div>";
    expect(mountSaveMenuItem(document.querySelector("#m")!, () => undefined)).toBeNull();

    const loose = document.createElement("div");

    loose.innerHTML = "";
    expect(mountSaveMenuItem(loose, () => undefined)).toBeNull();
  });
});

describe("watchChatButtonGroups", () => {
  it("adds a button to every composer, again after Discord re-renders one, never twice, and removes them all", async () => {
    document.body.innerHTML = group("a");

    const removed: string[] = [];
    const inject = vi.fn((target: Element) => {
      const marker = document.createElement("div");

      marker.dataset.nitfreeToggler = "";
      target.prepend(marker);

      return () => {
        removed.push(target.id);
        marker.remove();
      };
    });
    const afterScan = vi.fn();
    const stop = watchChatButtonGroups({ isInvalid: false }, inject, afterScan);

    expect(inject).toHaveBeenCalledTimes(1);
    expect(afterScan).toHaveBeenCalledTimes(1);

    // A thread's composer opens beside the channel's.
    document.body.insertAdjacentHTML("beforeend", group("b"));
    await frame();
    await frame();
    expect(inject).toHaveBeenCalledTimes(2);

    // Discord re-renders the channel's composer: the old group goes, a new one comes.
    document.querySelector("#a")!.parentElement!.remove();
    document.body.insertAdjacentHTML("beforeend", group("c"));
    await frame();
    await frame();
    expect(removed).toEqual(["a"]);
    expect(inject).toHaveBeenCalledTimes(3);

    // Its button taken out by Discord, a group gets one again.
    document.querySelector("#b [data-nitfree-toggler]")!.remove();
    await frame();
    await frame();
    expect(inject).toHaveBeenCalledTimes(4);

    stop();
    expect(removed.sort()).toEqual(["a", "b", "b", "c"]);
  });

  it("closes a popover whose button is gone, and leaves one whose button is still there", async () => {
    document.body.innerHTML = group("a");

    const stop = watchChatButtonGroups({ isInvalid: false }, () => () => undefined);
    const anchor = document.createElement("button");

    document.body.append(anchor);
    openPanel("popover", anchor);
    document.body.append(document.createElement("p"));
    await frame();
    await frame();
    expect(panel.open).toBe(true);

    anchor.remove();
    await frame();
    await frame();
    expect(panel.open).toBe(false);

    openPanel("picker", null);
    document.body.append(document.createElement("p"));
    await frame();
    await frame();
    expect(panel.open).toBe(true);

    stop();
    expect(panel.open).toBe(false);
  });

  it("does nothing once the extension has gone away, and works without an after-scan step", () => {
    document.body.innerHTML = group("a");

    const inject = vi.fn(() => () => undefined);

    watchChatButtonGroups({ isInvalid: true }, inject)();
    expect(inject).not.toHaveBeenCalled();

    watchChatButtonGroups({ isInvalid: false }, inject)();
    expect(inject).toHaveBeenCalledOnce();
  });
});

describe("mountPopover and mountOverlay", () => {
  it("add their host in a shadow root of its own, keep their events in, and take it all away", () => {
    const removePopover = mountPopover(() => undefined);
    const removeOverlay = mountOverlay();

    flushSync();

    const popover = document.querySelector<HTMLElement>("[data-nitfree-panel]")!;
    const overlay = document.querySelector<HTMLElement>("[data-nitfree-overlay]")!;

    expect(popover.shadowRoot?.querySelector("[data-stub]")?.getAttribute("data-props")).toBe("host onpick");
    expect(overlay.shadowRoot?.querySelector("[data-stub]")?.getAttribute("data-props")).toBe("host");
    expect(overlay.style.pointerEvents).toBe("none");

    const heard = vi.fn();

    document.body.addEventListener("keydown", heard);
    popover.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(heard).not.toHaveBeenCalled();

    removePopover();
    removeOverlay();
    expect(document.querySelector("[data-nitfree-panel], [data-nitfree-overlay]")).toBeNull();
  });
});
