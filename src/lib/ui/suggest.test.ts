// @vitest-environment happy-dom
import type { TItem } from "~/lib/db";

import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { library } from "./library.svelte";
import { preferences } from "./preferences.svelte";
import { followSuggestions, highlightSuggestion, pickSuggestion, suggest } from "./suggest.svelte";
import { still } from "./thumbnails";



vi.mock("./thumbnails", () => ({ still: vi.fn(async () => "blob:still"), forgetThumbnails: vi.fn() }));

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

function item(id: string, patch: Partial<TItem> = {}): TItem {
  return { id, type: "emoji", title: id, description: "", tags: [], packs: [], favorite: false, hash: id, size: 1, format: "png", mime: "image/png", width: 8, height: 8, animated: false, createdAt: 0, updatedAt: 0, usedAt: null, usageCount: 0, ...patch };
}

const ROW = (id: string) => `<div role="option" id="${id}" class="autocompleteRowVertical_1"><div class="autocompleteRowContent_c"><img class="emojiImage_i"><div class="autocompleteRowHeading_h">:${id}:</div></div></div>`;

const box = () => document.querySelector<HTMLElement>("#box")!;
const list = () => document.querySelector<HTMLElement>("#ac")!;
const ours = () => [...list().querySelectorAll<HTMLElement>("[data-nitfree-option]")];

function caret(offset: number): void {
  document.getSelection()!.collapse(document.querySelector("#line")!.firstChild!, offset);
  document.dispatchEvent(new Event("selectionchange"));
}

/**
 * A composer being typed in, and Discord's autocomplete for it, open or not.
 *
 * @param text - What the line holds.
 * @param open - Whether Discord shows its emoji rows.
 */
function compose(text: string, open = true): void {
  document.body.innerHTML = `
    <form class="channelTextArea_x">
      <div role="textbox" contenteditable="true" tabindex="0" id="box" aria-controls="ac" aria-expanded="${open}"><div data-slate-node="element"><span id="line">${text}</span></div></div>
    </form>
    <div id="ac" role="listbox">${open ? ROW("d1") + ROW("d2") : ""}</div>`;
  box().focus();
  caret(text.length);
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true, ...init });

  box().dispatchEvent(event);

  return event;
}

let pick: ReturnType<typeof vi.fn<(item: TItem, send: boolean, composer: Element) => void>>;
let stop: () => void;
let deleted: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = "";
  library.items = [item("cat"), item("cart", { type: "sticker" }), item("dog")];
  library.tags = [];
  Object.assign(preferences, { autocomplete: true, suggestionsAt: "end", clickAction: "send" });
  vi.mocked(still).mockResolvedValue("blob:still");

  // What the browser does that happy-dom does not: extend a selection by a character, and delete it.
  Object.defineProperty(Selection.prototype, "modify", {
    configurable: true,
    value(this: Selection, alter: string, direction: string, granularity: string) {
      if (alter !== "extend" || direction !== "backward" || granularity !== "character") {
        return;
      }

      this.setBaseAndExtent(this.anchorNode!, this.anchorOffset, this.focusNode!, Math.max(0, this.focusOffset - 1));
    },
  });
  deleted = vi.fn(() => document.getSelection()!.deleteFromDocument());
  Object.defineProperty(document, "execCommand", { configurable: true, value: deleted });

  pick = vi.fn();
  stop = followSuggestions(pick);
});

afterEach(() => {
  stop();
  vi.restoreAllMocks();
});

describe("followSuggestions inline", () => {
  it("adds rows like Discord's after its emoji rows for the name typed, with each item's picture", async () => {
    compose("hi :ca");
    await settle();

    expect(suggest).toMatchObject({ mode: "inline", query: "ca", highlighted: null });
    expect(ours().map(row => row.querySelector("[class^=autocompleteRowHeading_]")?.textContent)).toEqual([":cat:", ":cart:"]);
    expect(ours()[0]!.previousElementSibling?.id).toBe("d2");
    expect(ours().map(row => row.querySelector("[data-nitfree-type]")?.textContent)).toEqual(["Emoji", "Sticker"]);
    expect(ours()[0]!.querySelector("img")?.getAttribute("src")).toBe("blob:still");
    expect(document.querySelector("#nitfree-suggestions-style")).not.toBeNull();
  });

  it("puts them before Discord's rows when the popup says so, and shows no picture an item has none for", async () => {
    vi.mocked(still).mockResolvedValue(null);
    preferences.suggestionsAt = "start";
    flushSync();
    compose(":ca");
    await settle();

    expect(ours().at(-1)!.nextElementSibling?.id).toBe("d1");
    expect(ours()[0]!.querySelector("img")?.hasAttribute("src")).toBe(false);
  });

  it("puts its rows back, in place, when Discord draws its list again, and makes them again when the items change", async () => {
    compose(":ca");
    await settle();

    const before = ours()[0];

    list().innerHTML = ROW("d1") + ROW("d2");
    await settle();
    expect(ours()).toHaveLength(2);
    expect(ours()[0]).toBe(before);
    expect(ours()[0]!.previousElementSibling?.id).toBe("d2");

    library.items = [item("cat")];
    flushSync();
    await settle();
    expect(ours()).toHaveLength(1);
    expect(ours()[0]).not.toBe(before);

    // Moved apart by Discord, they are put together again.
    list().append(ours()[0]!);
    await settle();
    expect(ours()[0]!.previousElementSibling?.id).toBe("d2");
  });

  it("takes the keys only once Discord's highlight moves past its last row or above its first, and gives them back", async () => {
    compose(":ca");
    await settle();

    // Discord has its first row highlighted: a key down is Discord's.
    box().setAttribute("aria-activedescendant", "d1");
    expect(press("ArrowDown").defaultPrevented).toBe(false);

    box().setAttribute("aria-activedescendant", "d2");
    expect(press("ArrowDown").defaultPrevented).toBe(true);
    expect(suggest.highlighted).toBe(0);
    expect(list().hasAttribute("data-nitfree-suggesting")).toBe(true);
    expect(ours()[0]!.getAttribute("aria-selected")).toBe("true");

    expect(press("ArrowDown").defaultPrevented).toBe(true);
    expect(suggest.highlighted).toBe(1);

    // Past the last, back to Discord, which moves on as it would.
    expect(press("ArrowDown").defaultPrevented).toBe(false);
    expect(suggest.highlighted).toBeNull();
    expect(list().hasAttribute("data-nitfree-suggesting")).toBe(false);

    // From above Discord's first row, to Nitfree's last, then back up and out.
    box().setAttribute("aria-activedescendant", "d1");
    expect(press("ArrowUp").defaultPrevented).toBe(true);
    expect(suggest.highlighted).toBe(1);
    expect(press("ArrowUp").defaultPrevented).toBe(true);
    expect(press("ArrowUp").defaultPrevented).toBe(false);
    expect(suggest.highlighted).toBeNull();

    // Entered from the top, leaving down keeps the key so Discord's highlight stays.
    expect(press("ArrowUp").defaultPrevented).toBe(true);
    suggest.highlighted = 1;
    expect(press("ArrowDown").defaultPrevented).toBe(true);
    expect(suggest.highlighted).toBeNull();
    box().setAttribute("aria-activedescendant", "d2");
    expect(press("ArrowUp").defaultPrevented).toBe(false);
  });

  it("highlights the row under the pointer, picks it on a click, and keeps typing in the box", async () => {
    compose(":ca");
    await settle();
    box().setAttribute("aria-activedescendant", "d1");

    const [first, second] = ours();

    first!.dispatchEvent(new Event("pointermove"));
    expect(suggest.highlighted).toBe(0);

    const down = new MouseEvent("mousedown", { cancelable: true });

    second!.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);

    second!.dispatchEvent(new MouseEvent("click", { shiftKey: true }));
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: "cart" }), false, document.querySelector("form"));
    expect(suggest.mode).toBeNull();
  });

  it("remembers whether the pointer came from Discord's last row or its first", async () => {
    compose(":ca");
    await settle();
    box().setAttribute("aria-activedescendant", "d2");
    ours()[1]!.dispatchEvent(new Event("pointermove"));
    suggest.highlighted = 1;
    expect(press("ArrowDown").defaultPrevented).toBe(false);
  });
});

describe("followSuggestions in a list of their own", () => {
  it("shows when Discord suggests nothing, the first highlighted, and goes round with the arrow keys", async () => {
    compose(":ca", false);
    await settle();

    expect(suggest).toMatchObject({ mode: "list", highlighted: 0 });
    expect(ours()).toEqual([]);
    expect(press("ArrowUp").defaultPrevented).toBe(true);
    expect(suggest.highlighted).toBe(1);
    press("ArrowDown");
    expect(suggest.highlighted).toBe(0);

    suggest.highlighted = null;
    press("ArrowDown");
    expect(suggest.highlighted).toBe(1);
  });

  it("picks with Enter, which sends as a click does, or Tab, which only adds, taking the name out", async () => {
    compose("hi :ca", false);
    await settle();

    expect(press("Enter").defaultPrevented).toBe(true);
    expect(pick).toHaveBeenLastCalledWith(expect.objectContaining({ id: "cat" }), true, expect.any(HTMLFormElement));
    expect(deleted).toHaveBeenCalledWith("delete");
    expect(document.querySelector("#line")!.textContent).toBe("hi ");

    compose(":ca", false);
    await settle();
    press("Tab");
    expect(pick).toHaveBeenLastCalledWith(expect.objectContaining({ id: "cat" }), false, expect.any(HTMLFormElement));
  });

  it("lets Discord's editor take the deletion itself", async () => {
    compose(":ca", false);
    await settle();
    box().addEventListener("beforeinput", event => event.preventDefault());
    press("Enter");
    expect(deleted).not.toHaveBeenCalled();
  });

  it("leaves the text alone when what it would select is not the name", async () => {
    compose(":ca", false);
    await settle();
    Object.defineProperty(Selection.prototype, "modify", { configurable: true, value: () => undefined });
    press("Enter");
    expect(deleted).not.toHaveBeenCalled();
    expect(pick).toHaveBeenCalledOnce();
  });

  it("only picks, where there is no selection to take the name out with", async () => {
    compose(":ca", false);
    await settle();
    vi.spyOn(document, "getSelection").mockReturnValue(null);
    press("Enter");
    expect(pick).toHaveBeenCalledOnce();
    expect(deleted).not.toHaveBeenCalled();
  });

  it("hides on Escape until something else is typed, and leaves Escape to Discord", async () => {
    compose(":ca", false);
    await settle();

    expect(press("Escape").defaultPrevented).toBe(false);
    expect(suggest.mode).toBeNull();

    caret(3);
    await settle();
    expect(suggest.mode).toBeNull();

    document.querySelector("#line")!.textContent = ":c";
    caret(2);
    await settle();
    expect(suggest.mode).toBeNull();

    document.querySelector("#line")!.textContent = ":car";
    caret(4);
    await settle();
    expect(suggest).toMatchObject({ mode: "list", query: "car" });
  });

  it("leaves keys alone with a modifier, while composing, outside the box, with Shift on Enter, or with nothing highlighted", async () => {
    compose(":ca", false);
    await settle();

    expect(press("ArrowDown", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press("ArrowDown", { isComposing: true }).defaultPrevented).toBe(false);
    expect(press("Enter", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(press("a").defaultPrevented).toBe(false);

    const outside = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });

    document.body.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);

    suggest.highlighted = null;
    expect(press("Enter").defaultPrevented).toBe(false);

    suggest.highlighted = 9;
    expect(press("Enter").defaultPrevented).toBe(false);
  });
});

describe("followSuggestions, when there is nothing to suggest", () => {
  it("shows nothing without a match, with suggestions off, or with no name being typed", async () => {
    compose(":zz");
    await settle();
    expect(suggest.mode).toBeNull();

    compose("no colon");
    await settle();
    expect(suggest.mode).toBeNull();

    compose(":ca");
    await settle();
    expect(suggest.mode).toBe("inline");

    preferences.autocomplete = false;
    flushSync();
    expect(suggest.mode).toBeNull();
    expect(ours()).toEqual([]);
  });

  it("reads nothing while text is selected, or with the caret outside the box, and goes when focus leaves", async () => {
    compose(":ca");
    await settle();

    const text = document.querySelector("#line")!.firstChild!;

    document.getSelection()!.setBaseAndExtent(text, 0, text, 2);
    document.dispatchEvent(new Event("selectionchange"));
    expect(suggest.mode).toBeNull();

    caret(3);
    expect(suggest.mode).toBe("inline");

    const outside = document.body.appendChild(document.createElement("p"));

    outside.textContent = "x";
    document.getSelection()!.collapse(outside.firstChild!, 1);
    document.dispatchEvent(new Event("selectionchange"));
    expect(suggest.mode).toBeNull();

    caret(3);
    box().blur();
    document.dispatchEvent(new FocusEvent("focusout"));
    expect(suggest.mode).toBeNull();
  });

  it("reads nothing where the page has no selection, or an empty one", async () => {
    compose(":ca");
    await settle();

    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    expect(suggest.mode).toBeNull();

    caret(3);
    vi.spyOn(document, "getSelection").mockReturnValue(null);
    document.dispatchEvent(new Event("selectionchange"));
    expect(suggest.mode).toBeNull();
  });

  it("reads the line from the box itself when the editor has no line elements, and from a caret between elements", async () => {
    document.body.innerHTML = "<form><div role=\"textbox\" contenteditable=\"true\" tabindex=\"0\" id=\"box\"><span id=\"line\">:ca</span></div></form>";
    box().focus();
    caret(3);
    expect(suggest).toMatchObject({ mode: "list", query: "ca" });

    document.getSelection()!.collapse(box(), 1);
    document.dispatchEvent(new Event("selectionchange"));
    expect(suggest.query).toBe("ca");
  });

  it("follows a box that starts and stops pointing to Discord's list", async () => {
    compose(":ca", false);
    await settle();
    expect(suggest.mode).toBe("list");

    list().innerHTML = ROW("d1");
    box().setAttribute("aria-expanded", "true");
    await settle();
    expect(suggest.mode).toBe("inline");
    expect(ours()).toHaveLength(2);

    box().setAttribute("aria-expanded", "false");
    await settle();
    expect(suggest.mode).toBe("list");
    expect(ours()).toEqual([]);
  });
});

describe("pickSuggestion and highlightSuggestion", () => {
  it("pick nothing once the suggestions are gone, or outside a composer", async () => {
    pickSuggestion(item("cat"), true);
    expect(pick).not.toHaveBeenCalled();

    document.body.innerHTML = "<div role=\"textbox\" contenteditable=\"true\" tabindex=\"0\" id=\"box\"><span id=\"line\">:ca</span></div>";
    box().focus();
    caret(3);
    pickSuggestion(item("cat"), true);
    expect(pick).not.toHaveBeenCalled();
  });

  it("highlight in a list of their own as asked", async () => {
    compose(":ca", false);
    await settle();
    highlightSuggestion(1);
    expect(suggest.highlighted).toBe(1);
  });
});

describe("followSuggestions, in detail", () => {
  const typeIn = (text: string) => {
    document.querySelector("#line")!.textContent = text;
    caret(text.length);
  };

  it("reads only the line the caret is on, and ignores zero-width characters", async () => {
    document.body.innerHTML = "<form><div role=\"textbox\" contenteditable=\"true\" tabindex=\"0\" id=\"box\"><div data-slate-node=\"element\">:</div><div data-slate-node=\"element\"><span id=\"line\">ca</span></div></div></form>";
    box().focus();
    caret(2);
    expect(suggest.mode).toBeNull();

    compose(":﻿ca", false);
    expect(suggest).toMatchObject({ mode: "list", query: "ca" });
  });

  it("names its rows, marks the highlighted one and only that, and forgets all of it on close", async () => {
    compose(":ca");
    await settle();
    expect(ours().map(row => row.id)).toEqual(["nitfree-autocomplete-0", "nitfree-autocomplete-1"]);

    box().setAttribute("aria-activedescendant", "d2");
    press("ArrowDown");
    expect(ours().map(row => row.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(list().getAttribute("data-nitfree-suggesting")).toBe("");

    press("ArrowDown");
    expect(ours().map(row => row.getAttribute("aria-selected"))).toEqual(["false", "true"]);

    press("Escape");
    expect(list().hasAttribute("data-nitfree-suggesting")).toBe(false);
    expect(suggest).toMatchObject({ box: null, query: "", items: [], mode: null, highlighted: null });
  });

  it("moves its rows when the popup's setting changes, and keeps them together and in place", async () => {
    library.items = [item("cat"), item("cart", { type: "sticker" }), item("can")];
    compose(":ca");
    await settle();

    preferences.suggestionsAt = "start";
    flushSync();
    await settle();
    expect(ours().at(-1)!.nextElementSibling?.id).toBe("d1");

    // One of them strays, and the rest are put back around Discord's first row.
    list().append(ours()[1]!);
    await settle();
    expect(ours().map(row => row.id)).toEqual(["nitfree-autocomplete-0", "nitfree-autocomplete-1", "nitfree-autocomplete-2"]);
    expect(ours().at(-1)!.nextElementSibling?.id).toBe("d1");
    expect(ours()[0]!.previousElementSibling).toBeNull();

    preferences.suggestionsAt = "end";
    flushSync();
    await settle();
    expect(ours()[0]!.previousElementSibling?.id).toBe("d2");
  });

  it("puts its rows back next to Discord's last row when something is put between", async () => {
    library.items = [item("cat"), item("cart"), item("can")];
    compose(":ca");
    await settle();

    list().insertBefore(document.createElement("i"), ours()[0]!);
    await settle();
    expect(ours()[0]!.previousElementSibling?.id).toBe("d2");
    expect(ours().map(row => row.id)).toEqual(["nitfree-autocomplete-0", "nitfree-autocomplete-1", "nitfree-autocomplete-2"]);
  });

  it("hears Discord's list change through the box's aria-controls, too", async () => {
    compose(":ca", false);
    await settle();
    document.body.insertAdjacentHTML("beforeend", `<div id="other" role="listbox">${ROW("o1")}</div>`);
    box().setAttribute("aria-expanded", "true");
    box().setAttribute("aria-controls", "other");
    await settle();
    expect(suggest.mode).toBe("inline");
    expect(document.querySelector("#other [data-nitfree-option]")).not.toBeNull();
  });

  it("resets the highlight when what is suggested changes, and keeps it when it does not", async () => {
    library.items = [item("cat"), item("cart"), item("can"), item("cabin")];
    compose(":ca", false);
    await settle();

    suggest.highlighted = 2;
    document.dispatchEvent(new Event("selectionchange"));
    expect(suggest.highlighted).toBe(2);

    // A longer name, other suggestions.
    typeIn(":car");
    expect(suggest.highlighted).toBe(0);

    suggest.highlighted = 1;
    typeIn(":ca");
    expect(suggest.highlighted).toBe(0);

    // Same name and number of suggestions, but one of them is another.
    suggest.highlighted = 3;
    library.items = [item("cat"), item("cart"), item("can"), item("cabana")];
    flushSync();
    expect(suggest.highlighted).toBe(0);

    // The same ones, only one fewer.
    suggest.highlighted = 2;
    library.items = [item("cat"), item("cart"), item("can")];
    flushSync();
    expect(suggest.highlighted).toBe(0);

    // From a list of their own to Discord's rows.
    suggest.highlighted = 2;
    list().innerHTML = ROW("d1");
    box().setAttribute("aria-expanded", "true");
    await settle();
    expect(suggest).toMatchObject({ mode: "inline", highlighted: null });
  });

  it("shows again a name that was hidden, once another was typed or another box is used", async () => {
    compose(":ca", false);
    await settle();
    press("Escape");

    typeIn(":cat");
    expect(suggest.mode).toBe("list");
    typeIn(":ca");
    expect(suggest.mode).toBe("list");

    press("Escape");
    compose(":ca", false);
    await settle();
    expect(suggest.mode).toBe("list");
  });

  it("goes round three suggestions both ways, and only Escape hides them", async () => {
    library.items = [item("cat"), item("cart"), item("can")];
    compose(":ca", false);
    await settle();

    const seen: (number | null)[] = [];

    for (const key of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "ArrowUp"]) {
      press(key);
      seen.push(suggest.highlighted);
    }

    expect(seen).toEqual([1, 2, 0, 2, 1]);
    press("a");
    press("Backspace");
    press("Enter", { shiftKey: true });
    expect(suggest.mode).toBe("list");
  });

  it("stops the key it takes from reaching anyone else", async () => {
    compose(":ca", false);
    await settle();

    const later = vi.fn();

    window.addEventListener("keydown", later, true);
    press("ArrowDown");
    window.removeEventListener("keydown", later, true);
    expect(later).not.toHaveBeenCalled();
  });

  it("takes the name out as a backspace over a selection that editors can cancel, then picks with nothing left of it", async () => {
    compose(":ca", false);
    await settle();

    let seen: InputEvent | null = null;

    box().addEventListener("beforeinput", (event) => {
      seen = event as InputEvent;
      event.preventDefault();
    });
    pick.mockImplementation(() => expect(suggest.box).toBeNull());
    press("Enter");
    expect(seen).toMatchObject({ inputType: "deleteContentBackward", bubbles: true, cancelable: true });
    expect(pick).toHaveBeenCalledOnce();
  });

  it("leaves the caret at the end where it would select something else", async () => {
    compose(":ca", false);
    await settle();
    Object.defineProperty(Selection.prototype, "modify", { configurable: true, value: () => undefined });

    const collapse = vi.spyOn(Selection.prototype, "collapseToEnd");

    press("Enter");
    expect(collapse).toHaveBeenCalledOnce();
  });

  it("gives the keys back the way it took them, from the top or the bottom of Discord's rows", async () => {
    compose(":ca");
    await settle();
    list().insertAdjacentHTML("beforeend", ROW("d3"));
    await settle();

    // In the middle of Discord's rows, the keys are Discord's.
    box().setAttribute("aria-activedescendant", "d2");
    expect(press("ArrowDown").defaultPrevented).toBe(false);

    // In from the bottom: up at the first suggestion goes back, and the key is kept.
    box().setAttribute("aria-activedescendant", "d3");
    expect(press("ArrowDown").defaultPrevented).toBe(true);
    expect(press("ArrowUp").defaultPrevented).toBe(true);
    expect(suggest.highlighted).toBeNull();

    // In from the top, by the pointer: down at the last suggestion goes back, and the key is kept.
    box().setAttribute("aria-activedescendant", "d1");
    ours()[0]!.dispatchEvent(new Event("pointermove"));
    expect(suggest.highlighted).toBe(0);
    suggest.highlighted = 1;
    expect(press("ArrowDown").defaultPrevented).toBe(true);
    expect(suggest.highlighted).toBeNull();

    // Pointing again while a suggestion is highlighted does not change how the keys came.
    box().setAttribute("aria-activedescendant", "d3");
    ours()[0]!.dispatchEvent(new Event("pointermove"));
    ours()[1]!.dispatchEvent(new Event("pointermove"));
    expect(suggest.highlighted).toBe(1);
  });

  it("listens to the page's own events before the page does, and to all of them", async () => {
    compose(":ca", false);
    await settle();

    box().addEventListener("input", event => event.stopPropagation());
    box().addEventListener("focusout", event => event.stopPropagation());
    box().addEventListener("keydown", event => event.stopPropagation());

    typeIn(":zz");
    expect(suggest.mode).toBeNull();
    document.querySelector("#line")!.textContent = ":ca";
    document.getSelection()!.collapse(document.querySelector("#line")!.firstChild!, 3);
    box().dispatchEvent(new Event("input", { bubbles: true }));
    expect(suggest.mode).toBe("list");

    box().blur();
    box().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(suggest.mode).toBeNull();

    box().focus();
    caret(3);
    expect(press("ArrowDown").defaultPrevented).toBe(true);
  });

  it("is deaf to everything once stopped", async () => {
    compose(":ca", false);
    await settle();
    stop();

    library.items = [item("cat"), item("cart")];
    flushSync();
    box().dispatchEvent(new Event("input", { bubbles: true }));
    expect(suggest.mode).toBeNull();
    box().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(suggest.mode).toBeNull();
    expect(press("ArrowDown").defaultPrevented).toBe(false);

    // Started again, it shows what is being typed.
    stop = followSuggestions(pick);
    box().dispatchEvent(new Event("input", { bubbles: true }));
    expect(suggest.mode).toBe("list");
  });
});

describe("stopping", () => {
  it("takes away its rows, style and listeners", async () => {
    compose(":ca");
    await settle();
    stop();

    expect(ours()).toEqual([]);
    expect(document.querySelector("#nitfree-suggestions-style")).toBeNull();
    caret(3);
    expect(suggest.mode).toBeNull();
    stop = () => undefined;
  });
});
