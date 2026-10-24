// @vitest-environment happy-dom
import type { TItem } from "~/lib/db";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMessage } from "~/lib/messaging";
import { DEFAULT_SHORTCUT } from "~/lib/shortcut";

import { startContent } from "./content";
import { editor } from "./editor.svelte";
import { mountOverlay, mountPopover, watchChatButtonGroups } from "./inject";
import { clearNotice, notice } from "./notice.svelte";
import { closePanel, openPanel, panel, togglePanel } from "./panel.svelte";
import { createPickerTab } from "./picker";
import { preferences } from "./preferences.svelte";
import { followSaveFromChat } from "./save";
import { attachFile, prepareFile, SendError } from "./send";
import { followSuggestions } from "./suggest.svelte";
import { flushTrash } from "./trash.svelte";



const calls: string[] = [];
const stopper = (name: string) => () => void calls.push(name);

vi.mock("~/lib/messaging", async original => ({ ...await original<object>(), sendMessage: vi.fn(async () => null) }));
vi.mock("./library.svelte", () => ({ followLibrary: vi.fn(() => stopper("library")), library: { items: [], tags: [], packs: [], loaded: true, error: null } }));
vi.mock("./inject", () => ({
  mountOverlay: vi.fn(() => stopper("overlay")),
  mountPopover: vi.fn(() => stopper("popover")),
  mountToggler: vi.fn(),
  watchChatButtonGroups: vi.fn(() => stopper("togglers")),
}));
vi.mock("./picker", () => ({ createPickerTab: vi.fn() }));
vi.mock("./save", () => ({ followSaveFromChat: vi.fn(() => stopper("saving")) }));
vi.mock("./suggest.svelte", () => ({ followSuggestions: vi.fn(() => stopper("suggestions")) }));
vi.mock("./send", async original => ({ ...await original<object>(), prepareFile: vi.fn(), attachFile: vi.fn() }));
vi.mock("./trash.svelte", () => ({ flushTrash: vi.fn() }));

const settle = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const q = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function item(id = "a"): TItem {
  return { id, type: "emoji", title: id, description: "", tags: [], packs: [], favorite: false, hash: id, size: 1, format: "png", mime: "image/png", width: 8, height: 8, animated: false, createdAt: 0, updatedAt: 0, usedAt: null, usageCount: 0 };
}

function COMPOSER(id: string) {
  return `
  <form class="channelTextArea_x" id="composer-${id}">
    <div class="buttons_a">
      <div data-nitfree-toggler><div role="button" id="toggler-${id}" tabindex="0"></div></div>
      <div class="expression-picker-chat-input-button"><div role="button" class="emojiButton_e" id="emoji-${id}" aria-expanded="false"></div></div>
    </div>
    <div role="textbox" contenteditable="true" tabindex="0" id="box-${id}"></div>
  </form>`;
}

type TPickerOptions = Parameters<typeof createPickerTab>[0];

const picker = { open: false, selectable: true, scan: vi.fn(), isOpen: vi.fn(), select: vi.fn(), deselect: vi.fn(), stop: vi.fn() };
let pickerOptions: TPickerOptions;
let ctx: { isInvalid: boolean };
let stop: () => void;

function captured<T>(mock: { mock: { calls: unknown[][] } }, at = 0): T {
  return mock.mock.calls.at(-1)![at] as T;
}

const pick = () => captured<(item: TItem, primary: boolean) => void>(vi.mocked(mountPopover));
const afterScan = () => captured<() => void>(vi.mocked(watchChatButtonGroups), 2);
const suggestPick = () => captured<(item: TItem, send: boolean, composer: Element) => void>(vi.mocked(followSuggestions));

beforeEach(() => {
  document.body.innerHTML = COMPOSER("a") + COMPOSER("b");
  calls.length = 0;
  clearNotice();
  closePanel();
  editor.mode = null;
  Object.assign(picker, { open: false, selectable: true });
  picker.isOpen.mockImplementation(() => picker.open);
  picker.select.mockImplementation(() => picker.open && picker.selectable);
  vi.mocked(createPickerTab).mockImplementation((options) => {
    pickerOptions = options;

    return picker;
  });
  vi.mocked(prepareFile).mockReset().mockImplementation(async picked => new File(["x"], `${picked.title}.png`));
  vi.mocked(attachFile).mockReset().mockResolvedValue(undefined);
  vi.mocked(sendMessage).mockClear();
  ctx = { isInvalid: false };
  stop = startContent(ctx);
  Object.assign(preferences, { clickAction: "send", shortcut: DEFAULT_SHORTCUT });
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("startContent", () => {
  it("starts everything Nitfree adds to the page, and takes it all away again", () => {
    expect(mountOverlay).toHaveBeenCalledOnce();
    expect(followSaveFromChat).toHaveBeenCalledOnce();

    window.dispatchEvent(new Event("pagehide"));
    expect(flushTrash).toHaveBeenCalledOnce();

    stop();
    expect(calls).toEqual(["togglers", "saving", "suggestions", "overlay", "popover", "library"]);
    expect(picker.stop).toHaveBeenCalledOnce();
    expect(flushTrash).toHaveBeenCalledTimes(2);

    // The chat bar button falls back to the popover once Nitfree's picker tab is gone.
    togglePanel(q("#toggler-a"));
    expect(panel.mode).toBe("popover");
    stop = () => undefined;
  });
});

describe("the picker tab", () => {
  it("opens the panel in the picker for the composer whose picker it is, and closes it when left", () => {
    q("#emoji-b").setAttribute("aria-expanded", "true");
    pickerOptions.onchange(true);
    expect(panel).toMatchObject({ open: true, mode: "picker", anchor: q("#toggler-b") });

    // Already open there, selecting again changes nothing.
    pickerOptions.onchange(true);
    expect(panel.anchor).toBe(q("#toggler-b"));

    pickerOptions.onchange(false);
    expect(panel.open).toBe(false);

    // Left while the popover shows, the popover stays.
    openPanel("popover", q("#toggler-a"));
    pickerOptions.onchange(false);
    expect(panel.mode).toBe("popover");
  });

  it("opens for the button it was opened from, or for none when no picker is expanded", () => {
    openPanel("popover", q("#toggler-a"));
    pickerOptions.onchange(true);
    expect(panel).toMatchObject({ mode: "picker", anchor: q("#toggler-a") });

    closePanel();
    pickerOptions.onchange(true);
    expect(panel).toMatchObject({ mode: "picker", anchor: null });
  });
});

describe("picking an item", () => {
  it("sends it into the composer the panel was opened from, closing the panel and Discord's picker", async () => {
    const escape = vi.fn();

    document.addEventListener("keydown", event => escape(event.key));
    picker.open = true;
    openPanel("picker", q("#toggler-a"));
    pick()(item(), true);

    expect(panel.open).toBe(false);
    expect(picker.deselect).toHaveBeenCalled();
    expect(escape).toHaveBeenCalledWith("Escape");
    await settle();
    expect(attachFile).toHaveBeenCalledWith(q("#composer-a"), expect.any(File), { send: true, title: "a" });
    expect(sendMessage).toHaveBeenCalledWith("library:use", { id: "a" });
  });

  it("sends Escape to the page itself when nothing has focus, and goes on when the use cannot be recorded", async () => {
    const escape = vi.fn();

    document.body.addEventListener("keydown", event => escape(event.key));
    vi.spyOn(document, "activeElement", "get").mockReturnValue(null);
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error("Restarting."));
    picker.open = true;
    openPanel("picker", q("#toggler-a"));
    pick()(item(), true);
    expect(escape).toHaveBeenCalledWith("Escape");
    await settle();
    expect(sendMessage).toHaveBeenCalledWith("library:use", { id: "a" });
    expect(notice.text).toBeNull();
  });

  it("closes Discord's picker with its own button when Escape does not", async () => {
    q("#emoji-a").setAttribute("aria-expanded", "true");

    const clicked = vi.fn();

    q("#emoji-a").addEventListener("click", clicked);
    picker.open = true;
    openPanel("picker", q("#toggler-a"));
    pick()(item(), true);
    await frame();
    expect(clicked).toHaveBeenCalledOnce();

    // Closed by Escape, there is nothing to click.
    picker.open = true;
    openPanel("picker", q("#toggler-a"));
    pick()(item("b"), true);
    picker.open = false;
    await frame();
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("only adds it, keeping the panel open, for a Shift+click or when the popup swaps them", async () => {
    openPanel("popover", q("#toggler-a"));
    pick()(item(), false);
    expect(panel.open).toBe(true);
    await settle();
    expect(attachFile).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { send: false, title: "a" });

    preferences.clickAction = "add";
    pick()(item("b"), true);
    await settle();
    expect(attachFile).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { send: false, title: "b" });
  });

  it("sends from the popover without touching Discord's picker", async () => {
    openPanel("popover", q("#toggler-a"));
    pick()(item(), true);
    expect(picker.deselect).not.toHaveBeenCalled();
    await settle();
    expect(attachFile).toHaveBeenCalledOnce();
  });

  it("says there is no composer to send to", () => {
    pick()(item(), true);
    expect(notice.text).toBe("Nitfree could not find the message box to send to.");

    openPanel("popover", document.body.appendChild(document.createElement("button")));
    pick()(item(), true);
    expect(attachFile).not.toHaveBeenCalled();
  });

  it("goes one item at a time, ignoring one that is still on its way", async () => {
    let release!: () => void;

    vi.mocked(prepareFile).mockImplementationOnce(() => new Promise(resolve => (release = () => resolve(new File(["x"], "a.png")))));
    openPanel("popover", q("#toggler-a"));
    pick()(item("a"), false);
    pick()(item("a"), false);
    pick()(item("b"), false);
    await settle();
    expect(attachFile).not.toHaveBeenCalled();

    release();
    await settle();
    expect(vi.mocked(attachFile).mock.calls.map(([, file]) => file.name)).toEqual(["a.png", "b.png"]);
  });

  it("says why an item could not be sent, in Nitfree's words or the error's", async () => {
    openPanel("popover", q("#toggler-a"));
    vi.mocked(prepareFile).mockRejectedValueOnce(new SendError("Too big.")).mockRejectedValueOnce(new Error("Gone."));

    pick()(item("a"), false);
    await settle();
    expect(notice.text).toBe("Too big.");

    pick()(item("b"), false);
    await settle();
    expect(notice.text).toBe("Could not send “b”: Gone.");
    expect(sendMessage).not.toHaveBeenCalledWith("library:use", expect.anything());
  });

  it("does not send into a channel left meanwhile, or a composer that went", async () => {
    let release!: () => void;

    vi.mocked(prepareFile).mockImplementation(() => new Promise(resolve => (release = () => resolve(new File(["x"], "a.png")))));
    openPanel("popover", q("#toggler-a"));
    pick()(item("a"), false);
    await settle();
    history.pushState(null, "", "/channels/other");
    release();
    await settle();
    expect(notice.text).toBe("“a” was not sent, as the channel changed while it was being prepared.");

    openPanel("popover", q("#toggler-b"));
    pick()(item("b"), false);
    await settle();
    q("#composer-b").remove();
    release();
    await settle();
    expect(attachFile).not.toHaveBeenCalled();
  });

  it("stops quietly when Nitfree goes away while the file is prepared", async () => {
    openPanel("popover", q("#toggler-a"));
    ctx.isInvalid = true;
    pick()(item(), false);
    await settle();
    expect(attachFile).not.toHaveBeenCalled();
    expect(notice.text).toBeNull();
  });

  it("takes the items picked from the suggestions as well", async () => {
    suggestPick()(item(), true, q("#composer-b"));
    await settle();
    expect(attachFile).toHaveBeenCalledWith(q("#composer-b"), expect.any(File), { send: true, title: "a" });
  });
});

describe("the chat bar button", () => {
  function discordOpensPicker(): void {
    q("#emoji-a").addEventListener("click", () => {
      const open = q("#emoji-a").getAttribute("aria-expanded") === "true";

      q("#emoji-a").setAttribute("aria-expanded", String(!open));
      picker.open = !open;
    });
  }

  it("opens Discord's picker on the Nitfree tab, through its emoji button", () => {
    discordOpensPicker();
    togglePanel(q("#toggler-a"));
    expect(picker.open).toBe(true);
    expect(panel.open).toBe(false);

    afterScan()();
    expect(panel).toMatchObject({ open: true, mode: "picker", anchor: q("#toggler-a") });
    expect(picker.scan).toHaveBeenCalled();
  });

  it("uses the popover when the picker opens without a tab to select, closing what the emoji button opened", () => {
    discordOpensPicker();
    picker.selectable = false;
    togglePanel(q("#toggler-a"));
    afterScan()();
    expect(panel).toMatchObject({ open: true, mode: "popover" });
    expect(picker.open).toBe(false);
  });

  it("uses the popover when the picker does not open in time, unless Nitfree went away or another button took over", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    togglePanel(q("#toggler-a"));
    vi.advanceTimersByTime(600);
    expect(panel).toMatchObject({ open: true, mode: "popover", anchor: q("#toggler-a") });

    closePanel();
    ctx.isInvalid = true;
    togglePanel(q("#toggler-b"));
    vi.advanceTimersByTime(600);
    expect(panel.open).toBe(false);

    ctx.isInvalid = false;
    togglePanel(q("#toggler-a"));
    togglePanel(q("#toggler-b"));
    vi.advanceTimersByTime(600);
    expect(panel.anchor).toBe(q("#toggler-b"));
  });

  it("selects the tab at once in a picker that is already open", () => {
    picker.open = true;
    togglePanel(q("#toggler-a"));
    expect(panel).toMatchObject({ mode: "picker", anchor: q("#toggler-a") });
  });

  it("closes the panel, and Discord's picker with it, when pressed again", () => {
    picker.open = true;
    togglePanel(q("#toggler-a"));
    togglePanel(q("#toggler-a"));
    expect(panel.open).toBe(false);
    expect(picker.deselect).toHaveBeenCalled();

    // The popover, likewise, without the picker.
    picker.open = false;
    openPanel("popover", q("#toggler-a"));
    togglePanel(q("#toggler-a"));
    expect(panel.open).toBe(false);
  });

  it("closes the popover of another composer before opening for this one, and uses the popover where there is no emoji button", () => {
    openPanel("popover", q("#toggler-b"));
    picker.open = true;
    togglePanel(q("#toggler-a"));
    expect(panel).toMatchObject({ mode: "picker", anchor: q("#toggler-a") });

    const lone = document.body.appendChild(document.createElement("button"));

    picker.open = false;
    togglePanel(lone);
    expect(panel).toMatchObject({ mode: "popover", anchor: lone });
  });

  it("rescans without anything to finish when nothing was waiting for the picker", () => {
    afterScan()();
    expect(picker.scan).toHaveBeenCalledOnce();
    expect(panel.open).toBe(false);
  });
});

describe("the chat bar button, in detail", () => {
  it("does not let the wait for the picker open the popover over it once it opened", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    q("#emoji-a").addEventListener("click", () => (picker.open = true));
    togglePanel(q("#toggler-a"));
    afterScan()();
    vi.advanceTimersByTime(600);
    expect(panel).toMatchObject({ open: true, mode: "picker" });
  });

  it("rescans an open picker with nothing waiting for it", () => {
    picker.open = true;
    expect(() => afterScan()()).not.toThrow();
    expect(panel.open).toBe(false);
  });

  it("falls back to the popover without pressing an emoji button that opened nothing", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const clicks = vi.fn();

    togglePanel(q("#toggler-a"));
    q("#emoji-a").addEventListener("click", clicks);
    vi.advanceTimersByTime(600);
    expect(panel.mode).toBe("popover");
    expect(clicks).not.toHaveBeenCalled();
  });

  it("closes a popover pressed again without touching Discord's picker", () => {
    openPanel("popover", q("#toggler-a"));
    togglePanel(q("#toggler-a"));
    expect(picker.deselect).not.toHaveBeenCalled();
  });
});

describe("picking, in detail", () => {
  it("takes the same item again once it is in", async () => {
    openPanel("popover", q("#toggler-a"));
    pick()(item(), false);
    await settle();
    pick()(item(), false);
    await settle();
    expect(attachFile).toHaveBeenCalledTimes(2);
  });
});

describe("the keyboard shortcut, in detail", () => {
  const press = () => {
    const event = new KeyboardEvent("keydown", { key: "n", code: "KeyN", ctrlKey: true, altKey: true, bubbles: true, cancelable: true });

    Object.defineProperty(event, "getModifierState", { value: () => false });
    (document.activeElement ?? document.body).dispatchEvent(event);
  };

  it("opens for the composer typed in once the panel is closed, or its button is gone", () => {
    picker.open = true;
    openPanel("popover", q("#toggler-b"));
    closePanel();
    q("#box-a").focus();
    press();
    expect(panel.anchor).toBe(q("#toggler-a"));

    closePanel();
    openPanel("popover", q("#toggler-b"));
    q("#toggler-b").remove();
    q("#box-a").focus();
    press();
    expect(panel.anchor).toBe(q("#toggler-a"));
  });
});

describe("the keyboard shortcut", () => {
  function shortcut(init: KeyboardEventInit = {}, altGraph = false): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key: "n", code: "KeyN", ctrlKey: true, altKey: true, bubbles: true, cancelable: true, ...init });

    // happy-dom counts Ctrl+Alt as AltGr, as a browser does not for Ctrl+Alt+N: it is said here.
    Object.defineProperty(event, "getModifierState", { value: (key: string) => key === "AltGraph" && altGraph });

    (document.activeElement ?? document.body).dispatchEvent(event);

    return event;
  }

  it("opens the panel for the composer being typed in, ready to type, and closes it again", () => {
    picker.open = true;
    q("#box-b").focus();

    expect(shortcut().defaultPrevented).toBe(true);
    expect(panel.anchor).toBe(q("#toggler-b"));
    expect(document.activeElement).toBe(q("#toggler-b"));

    shortcut();
    expect(panel.open).toBe(false);
  });

  it("opens for the channel's composer when none has focus, and for the one the panel is open for", () => {
    picker.open = true;
    shortcut();
    expect(panel.anchor).toBe(q("#toggler-a"));

    openPanel("popover", q("#toggler-b"));
    q("#box-a").focus();
    shortcut();
    expect(panel.open).toBe(false);
  });

  it("leaves the keys alone when turned off, repeated, composing, AltGr, in a dialog, or another combination", () => {
    const pressed = [
      shortcut({ repeat: true }),
      shortcut({ isComposing: true }),
      shortcut({}, true),
      shortcut({ key: "m", code: "KeyM" }),
    ];

    editor.mode = "add";
    pressed.push(shortcut());
    editor.mode = null;
    preferences.shortcut = null;
    pressed.push(shortcut());

    expect(pressed.some(event => event.defaultPrevented)).toBe(false);
    expect(panel.open).toBe(false);
  });

  it("does nothing where there is no Nitfree button", () => {
    document.body.innerHTML = "";
    expect(shortcut().defaultPrevented).toBe(false);
  });

  it("hears the keys before the page does, and keeps them from anyone else", () => {
    picker.open = true;
    q("#box-a").focus();
    q("#box-a").addEventListener("keydown", event => event.stopPropagation());

    const later = vi.fn();

    window.addEventListener("keydown", later, true);
    shortcut();
    window.removeEventListener("keydown", later, true);
    expect(panel.open).toBe(true);
    expect(later).not.toHaveBeenCalled();
  });

  it("hears nothing once stopped", () => {
    picker.open = true;
    stop();
    expect(shortcut().defaultPrevented).toBe(false);
    stop = () => undefined;
  });
});

describe("stopping", () => {
  it("drops what it had going: the dialog, the notice, the trash on leaving, and a picker it waited for", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    togglePanel(q("#toggler-a"));
    editor.mode = "add";
    notice.text = "Saved.";
    stop();

    expect(editor.mode).toBeNull();
    expect(notice.text).toBeNull();
    vi.advanceTimersByTime(600);
    expect(panel.open).toBe(false);

    window.dispatchEvent(new Event("pagehide"));
    expect(flushTrash).toHaveBeenCalledOnce();
    stop = () => undefined;
  });
});
