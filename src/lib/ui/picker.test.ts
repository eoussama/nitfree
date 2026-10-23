// @vitest-environment happy-dom
import type { TPickerTab } from "./picker";

import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPickerTab } from "./picker";



vi.mock("~/components/Library.svelte", () => import("~/test/LibraryStub.svelte"));

const settle = () => new Promise(resolve => setTimeout(resolve, 10));
const counter = globalThis as { focusedSearch?: number };

const TABS = `
  <div role="tab" id="gif-picker-tab" class="navButton_1" aria-selected="false">GIFs</div>
  <div role="tab" id="emoji-picker-tab" class="navButton_1 navButtonActive_2" aria-selected="true">Emoji</div>`;

/**
 * Discord's expression picker, as its markup is laid out.
 *
 * @param options - How it is laid out.
 * @param options.dialog - Whether the picker has its dialog role, which newer markup has.
 * @param options.panel - Whether it shows a tab panel.
 * @returns The picker's HTML.
 */
function picker({ dialog = true, panel = true } = {}): string {
  return `<div class="expressionPickerPositionLayer_x" id="layer">
    <div ${dialog ? "role=\"dialog\"" : ""} id="dialog">
      <div class="header"><div role="tablist" id="tabs">${TABS}<span id="label">label</span></div></div>
      <div class="contents" id="contents">${panel ? "<div role=\"tabpanel\" id=\"emoji-panel\"></div>" : ""}</div>
    </div>
  </div>`;
}

const CHAT_BAR = `<div class="expression-picker-chat-input-button"><div role="button" id="gif-button" aria-expanded="false"><span id="gif-icon"></span></div></div>
  <div class="expression-picker-chat-input-button"><div role="button" id="emoji-button" aria-expanded="true"></div></div>`;

const q = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const tab = () => document.querySelector<HTMLElement>("#nitfree-picker-tab");
const host = () => document.querySelector<HTMLElement>("#nitfree-picker-tab-panel");

let controller: TPickerTab;
let changes: boolean[];
const onpick = vi.fn();

function open(html = picker()): void {
  document.body.innerHTML = CHAT_BAR + html;
  controller.scan();
}

beforeEach(() => {
  document.body.innerHTML = CHAT_BAR;
  document.head.innerHTML = "";
  counter.focusedSearch = 0;
  changes = [];
  controller = createPickerTab({ onpick, onchange: selected => changes.push(selected) });
});

afterEach(() => {
  controller.stop();
  vi.restoreAllMocks();
});

describe("createPickerTab", () => {
  it("adds its style, and nothing else until Discord's picker opens", () => {
    expect(document.querySelector("#nitfree-picker-style")).not.toBeNull();
    controller.scan();
    expect(controller.isOpen()).toBe(false);
    expect(tab()).toBeNull();
    expect(controller.select()).toBe(false);
  });

  it("adds a tab looking like Discord's, and its panel, to a picker that opens", () => {
    open();

    expect(controller.isOpen()).toBe(true);
    expect(tab()).toMatchObject({ className: "navButton_1", textContent: "Nitfree", tabIndex: 0 });
    expect(tab()!.getAttribute("aria-selected")).toBe("false");
    expect(q("#tabs").lastElementChild).toBe(tab());
    expect(host()!.parentElement?.id).toBe("contents");
    expect(host()!.shadowRoot).not.toBeNull();
  });

  it("shows the library when the tab is chosen, taking the selection from Discord's tab", () => {
    open();
    tab()!.click();
    flushSync();

    expect(changes).toEqual([true]);
    expect(host()!.shadowRoot!.querySelector("[data-library-stub]")?.getAttribute("data-onpick")).toBe("function");
    expect(host()!.style.height).toBe("426px");
    expect(q("#contents").hasAttribute("data-nitfree-selected")).toBe(true);
    expect(tab()!.classList.contains("navButtonActive_2")).toBe(true);
    expect(tab()!.getAttribute("aria-selected")).toBe("true");
    expect(q("#emoji-picker-tab").classList.contains("navButtonActive_2")).toBe(false);
    expect(q("#emoji-picker-tab").getAttribute("aria-selected")).toBe("false");
    expect(counter.focusedSearch).toBe(1);
  });

  it("is chosen with Enter or Space, and not other keys", () => {
    open();

    const other = new KeyboardEvent("keydown", { key: "a", cancelable: true });

    tab()!.dispatchEvent(other);
    expect(changes).toEqual([]);

    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });

    tab()!.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(changes).toEqual([true]);

    tab()!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", cancelable: true }));
    expect(counter.focusedSearch).toBe(2);
  });

  it("takes its panel's height from Discord's, or from its own place", () => {
    open();
    vi.spyOn(q("#emoji-panel"), "getBoundingClientRect").mockReturnValue({ height: 300 } as DOMRect);
    controller.select();
    expect(host()!.style.height).toBe("300px");

    controller.deselect();
    q("#emoji-panel").remove();
    vi.spyOn(host()!, "getBoundingClientRect").mockReturnValue({ height: 280 } as DOMRect);
    controller.select();
    expect(host()!.style.height).toBe("280px");
  });

  it("gives the selection back to the tab Discord had when one of Discord's tabs is chosen", () => {
    open();
    controller.select();

    // Not a tab: nothing changes.
    q("#label").click();
    q("#gif-picker-tab").dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(changes).toEqual([true]);

    q("#gif-picker-tab").click();
    expect(changes).toEqual([true, false]);
    expect(q("#emoji-picker-tab").classList.contains("navButtonActive_2")).toBe(true);
    expect(q("#emoji-picker-tab").getAttribute("aria-selected")).toBe("true");
    expect(q("#contents").hasAttribute("data-nitfree-selected")).toBe(false);
    expect(tab()!.classList.contains("navButtonActive_2")).toBe(false);

    // Not selected, a click on Discord's tabs is Discord's own.
    q("#gif-picker-tab").click();
    expect(changes).toEqual([true, false]);

    controller.select();
    q("#gif-picker-tab").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(changes).toEqual([true, false, true, false]);
  });

  it("puts the selection back when React draws Discord's tabs again", async () => {
    open();
    controller.select();

    q("#emoji-picker-tab").className = "navButton_1 navButtonActive_2";
    await settle();
    expect(q("#emoji-picker-tab").classList.contains("navButtonActive_2")).toBe(false);
    expect(tab()!.classList.contains("navButtonActive_2")).toBe(true);
  });

  it("stays selected through a picker Discord draws again, and adds the tab back when React removes it", () => {
    open();
    controller.select();

    // The whole picker is drawn anew.
    q("#layer").outerHTML = picker();
    controller.scan();
    expect(changes).toEqual([true]);
    expect(tab()!.getAttribute("aria-selected")).toBe("true");
    expect(q("#contents").hasAttribute("data-nitfree-selected")).toBe(true);

    // Only the tab goes.
    tab()!.remove();
    controller.scan();
    expect(tab()).not.toBeNull();
  });

  it("is left when the picker closes", () => {
    open();
    controller.select();
    q("#layer").remove();
    controller.scan();
    expect(changes).toEqual([true, false]);
    expect(controller.isOpen()).toBe(false);

    // The panel's host alone gone, it is added again, not selected.
    open();
    host()!.remove();
    controller.scan();
    expect(host()).not.toBeNull();
  });

  it("selects itself in a picker it has not seen yet, and finds the panel in older markup", () => {
    document.body.innerHTML = CHAT_BAR + picker({ dialog: false });
    expect(controller.select()).toBe(true);
    expect(host()!.parentElement?.id).toBe("contents");
  });

  it("does nothing in a picker with no panel to show in", () => {
    open(picker({ panel: false }));
    expect(tab()).toBeNull();
    expect(controller.select()).toBe(false);
  });

  it("works where Discord marks no tab as selected", () => {
    open(picker().replace(" navButtonActive_2", ""));
    controller.select();
    expect(tab()!.className).toBe("navButton_1");
    controller.deselect();
    expect(q("#emoji-picker-tab").getAttribute("aria-selected")).toBe("false");
  });
});

describe("the chat bar's picker buttons", () => {
  it("show the tab Discord hid instead of closing the picker, and switch tabs as usual otherwise", () => {
    open();
    controller.select();

    const hidden = new MouseEvent("click", { bubbles: true, cancelable: true });

    q("#emoji-button").dispatchEvent(hidden);
    expect(hidden.defaultPrevented).toBe(true);
    expect(changes).toEqual([true, false]);

    controller.select();

    const other = new MouseEvent("click", { bubbles: true, cancelable: true });

    q("#gif-icon").dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    expect(changes).toEqual([true, false, true, false]);
  });

  it("are left alone while the tab is not selected, for keys that are not activation, and for other buttons", () => {
    open();

    const ignored = new MouseEvent("click", { bubbles: true, cancelable: true });

    q("#emoji-button").dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);

    controller.select();
    q("#emoji-button").dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    document.body.click();
    expect(changes).toEqual([true]);

    q("#emoji-button").dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(changes).toEqual([true, false]);
  });
});

describe("stop", () => {
  it("takes away the tab, its panel, its style and listeners, and gives Discord its tab back", () => {
    open();
    controller.select();
    controller.stop();

    expect(tab()).toBeNull();
    expect(host()).toBeNull();
    expect(document.querySelector("#nitfree-picker-style")).toBeNull();
    expect(changes).toEqual([true, false]);
    expect(q("#emoji-picker-tab").classList.contains("navButtonActive_2")).toBe(true);

    controller.stop();
    controller = createPickerTab({ onpick, onchange: () => undefined });
  });

  it("restores nothing when Discord's tab went meanwhile", () => {
    open();
    controller.select();
    q("#emoji-picker-tab").remove();
    controller.deselect();
    expect(q("#gif-picker-tab").classList.contains("navButtonActive_2")).toBe(false);
  });
});
