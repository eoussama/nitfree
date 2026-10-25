// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkComposer, probe, runChecks } from "./checks";



const q = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

/**
 * A composer as Discord renders it, with Nitfree's button first in its chat bar.
 */
const COMPOSER = `
  <form class="channelTextArea_x">
    <div class="buttons_a">
      <div data-nitfree-toggler></div>
      <div class="expression-picker-chat-input-button buttonContainer_1">
        <div role="button" class="button_b" aria-expanded="false" aria-controls="gifs"><div class="buttonWrapper_w"></div></div>
      </div>
      <div class="expression-picker-chat-input-button buttonContainer_2">
        <div role="button" class="button_b emojiButton_e" aria-expanded="false" aria-controls="emojis"><div class="buttonWrapper_w"></div></div>
      </div>
    </div>
    <div role="textbox" data-slate-editor="true" contenteditable="true"></div>
    <div class="uploadInput_u"><input type="file"></div>
  </form>`;

/**
 * Discord's expression picker, in the layer it renders it in.
 */
const PICKER = `
  <div class="expressionPickerPositionLayer_p">
    <div role="dialog">
      <div role="tablist">
        <div role="tab" id="emoji-picker-tab" class="navButton_n navItem_n navButtonActive_n" aria-selected="true"></div>
        <div role="tab" id="gif-picker-tab" class="navButton_n navItem_n" aria-selected="false"></div>
      </div>
      <div><div role="tabpanel"></div></div>
    </div>
  </div>`;

/**
 * One of Discord's context menus, with an item.
 */
const MENU = "<div role=\"menu\"><div role=\"group\"><div role=\"menuitem\" class=\"item_m labelContainer_m colorDefault_m\"><div class=\"label_m\">Reply</div></div></div></div>";

const listeners: (() => void)[] = [];

/**
 * Listens on the page until the test ends, as the stand-ins for Discord do.
 *
 * @param type - The event.
 * @param listener - What to do.
 */
function listen<K extends keyof DocumentEventMap>(type: K, listener: (event: DocumentEventMap[K]) => void): void {
  document.addEventListener(type, listener);
  listeners.push(() => document.removeEventListener(type, listener));
}

/**
 * A PNG sticker and an attached image in a message, which Nitfree can save, and one of Discord's
 * animated stickers, drawn by Lottie, which it cannot.
 */
const STICKER = "<img data-type=\"sticker\" data-id=\"2\" data-name=\"Wave\" data-format-type=\"1\">";
const IMAGE = "<a data-role=\"img\" href=\"https://cdn.discordapp.com/attachments/1/2/cat.png\"></a>";
const LOTTIE = "<div data-type=\"sticker\" data-id=\"3\" data-name=\"Hello\" data-format-type=\"3\"></div>";

function mount(html: string): void {
  document.body.innerHTML = html;
}

function statuses(checks: { id: string; status: string }[]): Record<string, string> {
  return Object.fromEntries(checks.map(check => [check.id, check.status]));
}

function onPage(path: string): void {
  history.replaceState(null, "", path);
}

beforeEach(() => {
  mount("");
  onPage("/channels/@me");
  document.documentElement.className = "theme-dark";
});

afterEach(() => {
  listeners.splice(0).forEach(stop => stop());
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.documentElement.className = "";
});

describe("probe", () => {
  it("is ok on the first alternative, a fallback on a later one, and missing or skipped on none", () => {
    mount("<p class=\"b\"></p><p class=\"b\"></p>");

    expect(probe("composer", document, [".b", ".a"])).toEqual({ check: { id: "composer", status: "ok" }, found: [...document.querySelectorAll(".b")] });
    expect(probe("composer", document, [".a", ".z", ".b"]).check).toEqual({ id: "composer", status: "fallback", alternative: { used: 3, of: 3 } });
    expect(probe("composer", document, [".a"])).toEqual({ check: { id: "composer", status: "missing" }, found: [] });
    expect(probe("composer", document, [".a"], "skipped").check).toEqual({ id: "composer", status: "skipped" });
  });

  it("looks only in its root", () => {
    mount("<i class=\"b\"></i><div id=\"root\"></div>");

    expect(probe("composer", q("#root"), [".b"]).check.status).toBe("missing");
  });
});

describe("the message box", () => {
  it("works when everything Nitfree uses is found by its first alternative", () => {
    mount(COMPOSER);

    expect(checkComposer()).toEqual([
      { id: "composer", status: "ok" },
      { id: "composerBox", status: "ok" },
      { id: "messageBox", status: "ok" },
      { id: "uploadInput", status: "ok" },
      { id: "chatButtonGroup", status: "ok" },
      { id: "chatButtonModel", status: "ok" },
      { id: "chatButtonLook", status: "ok" },
      { id: "pickerButton", status: "ok" },
      { id: "emojiButton", status: "ok" },
      { id: "toggler", status: "ok" },
    ]);
  });

  it("tells which fallback matched once Discord renames its classes", () => {
    mount(COMPOSER);
    q("form").className = "form_f";
    q("[role=textbox]").removeAttribute("data-slate-editor");
    q(".emojiButton_e").classList.remove("emojiButton_e");

    const checks = checkComposer();

    expect(checks.find(check => check.id === "composerBox")).toEqual({ id: "composerBox", status: "fallback", alternative: { used: 2, of: 2 } });
    expect(checks.find(check => check.id === "chatButtonGroup")).toEqual({ id: "chatButtonGroup", status: "fallback", alternative: { used: 2, of: 2 } });
    expect(checks.find(check => check.id === "messageBox")).toEqual({ id: "messageBox", status: "fallback", alternative: { used: 2, of: 2 } });
    // The last picker button stands in for the emoji button.
    expect(checks.find(check => check.id === "emojiButton")).toEqual({ id: "emojiButton", status: "fallback", alternative: { used: 2, of: 2 } });
    expect(statuses(checks)).toMatchObject({ composer: "ok", toggler: "ok", pickerButton: "ok" });
  });

  it("finds what is missing inside it", () => {
    mount(COMPOSER);
    q("[data-nitfree-toggler]").remove();
    q(".uploadInput_u").remove();
    document.querySelectorAll(".buttonWrapper_w").forEach(wrapper => wrapper.classList.remove("buttonWrapper_w"));

    expect(statuses(checkComposer())).toMatchObject({ uploadInput: "missing", chatButtonLook: "missing", toggler: "missing", chatButtonModel: "ok" });
  });

  it("needs Nitfree's button in every chat bar, such as an open thread's", () => {
    mount(`${COMPOSER}<aside>${COMPOSER}</aside>`);
    q("aside [data-nitfree-toggler]").remove();

    expect(statuses(checkComposer()).toggler).toBe("missing");
  });

  it("counts a button group without picker buttons as having no emoji button", () => {
    mount(COMPOSER);
    document.querySelectorAll("[role=button]").forEach(button => button.remove());

    expect(statuses(checkComposer())).toMatchObject({ pickerButton: "missing", emojiButton: "missing" });
  });

  it("skips the chat bar's checks without a chat bar", () => {
    mount("<form><div role=\"textbox\" contenteditable=\"true\"></div></form>");

    expect(statuses(checkComposer())).toEqual({
      composer: "ok",
      composerBox: "fallback",
      messageBox: "fallback",
      uploadInput: "missing",
      chatButtonGroup: "missing",
      chatButtonModel: "skipped",
      chatButtonLook: "skipped",
      pickerButton: "skipped",
      emojiButton: "skipped",
      toggler: "skipped",
    });
  });

  it("is skipped on pages without one, but missing on a channel's", () => {
    const skipped = checkComposer();

    expect(skipped).toHaveLength(10);
    expect(skipped.every(check => check.status === "skipped")).toBe(true);

    onPage("/channels/123/456");
    expect(statuses(checkComposer())).toMatchObject({ composer: "missing", messageBox: "skipped" });

    onPage("/channels/@me/456");
    expect(statuses(checkComposer()).composer).toBe("missing");

    // A link to a message opens its channel.
    onPage("/channels/123/456/789");
    expect(statuses(checkComposer()).composer).toBe("missing");

    onPage("/channels/123/456abc");
    expect(statuses(checkComposer()).composer).toBe("skipped");

    onPage("/channels/123");
    expect(statuses(checkComposer()).composer).toBe("skipped");

    onPage("/store/channels/1/2");
    expect(statuses(checkComposer()).composer).toBe("skipped");
  });
});

describe("the page", () => {
  it("is checked in the order of the groups, leaving the picker and menus closed", async () => {
    mount(COMPOSER);

    const checks = await runChecks(false);

    expect(checks.map(check => check.id)).toEqual([
      "composer",
      "composerBox",
      "messageBox",
      "uploadInput",
      "chatButtonGroup",
      "chatButtonModel",
      "chatButtonLook",
      "pickerButton",
      "emojiButton",
      "toggler",
      "theme",
      "chatEmoji",
      "chatSticker",
      "chatImage",
      "pickerTabList",
      "pickerTabLook",
      "pickerTab",
      "contextMenu",
      "menuLook",
      "saveMenuItem",
    ]);
    expect(statuses(checks)).toMatchObject({
      theme: "ok",
      chatEmoji: "skipped",
      chatSticker: "skipped",
      chatImage: "skipped",
      pickerTabList: "skipped",
      pickerTabLook: "skipped",
      pickerTab: "skipped",
      contextMenu: "skipped",
      menuLook: "skipped",
      saveMenuItem: "skipped",
    });
  });

  it("finds Discord's theme, and the emojis, stickers and images shown", async () => {
    mount(`
      <img data-type="emoji" data-id="1">
      <img data-type="sticker" data-id="2">
      <a data-role="img"></a>`);
    expect(statuses(await runChecks(false))).toMatchObject({ theme: "ok", chatEmoji: "ok", chatSticker: "ok", chatImage: "ok" });

    document.documentElement.className = "";
    expect(statuses(await runChecks(false)).theme).toBe("missing");
  });

  it("checks a picker that is already open, and the Nitfree tab in it", async () => {
    mount(PICKER);
    expect(statuses(await runChecks(false))).toMatchObject({ pickerTabList: "ok", pickerTabLook: "ok", pickerTab: "missing" });

    q("[role=tablist]").insertAdjacentHTML("beforeend", "<div role=\"tab\" id=\"nitfree-picker-tab\"></div>");
    expect(statuses(await runChecks(false))).toMatchObject({ pickerTabList: "ok", pickerTabLook: "ok", pickerTab: "ok" });

    q("#emoji-picker-tab").classList.remove("navButtonActive_n");
    expect(statuses(await runChecks(false)).pickerTabLook).toBe("missing");

    document.querySelectorAll("[role=tab]").forEach(tab => tab.removeAttribute("class"));
    q("#emoji-picker-tab").classList.add("navButtonActive_n");
    expect(statuses(await runChecks(false)).pickerTabLook).toBe("missing");
  });
});

/**
 * Plays Discord's picker: the emoji button opens it, Escape closes it, and Nitfree adds its tab.
 *
 * @param options - How the stand-in behaves.
 * @param options.opens - Whether the emoji button opens the picker.
 * @param options.escapes - Whether Escape closes it.
 * @param options.tab - Whether Nitfree adds its tab.
 * @param options.lingers - How long the picker stays open before Discord closes it by itself, if it does.
 * @returns The clicks on the emoji button.
 */
function playPicker({ opens = true, escapes = true, tab = true, lingers = Infinity } = {}): { clicks: () => number } {
  let clicks = 0;
  const emoji = q(".emojiButton_e");

  const close = (): void => {
    document.querySelector(".expressionPickerPositionLayer_p")?.remove();
  };

  emoji.addEventListener("click", () => {
    clicks++;

    if (document.querySelector(".expressionPickerPositionLayer_p")) {
      close();

      return;
    }

    if (opens) {
      // Discord changes something else on the page first.
      setTimeout(() => document.body.append(document.createElement("i")), 50);
      setTimeout(() => {
        document.body.insertAdjacentHTML("beforeend", PICKER);

        if (lingers < Infinity) {
          setTimeout(close, lingers);
        }

        if (tab) {
          setTimeout(() => q("[role=tablist]").insertAdjacentHTML("beforeend", "<div role=\"tab\" id=\"nitfree-picker-tab\"></div>"), 16);
        }
      }, 100);
    }
  });
  listen("keydown", (event) => {
    if (escapes && event.key === "Escape") {
      setTimeout(close, 10);
    }
  });

  return { clicks: () => clicks };
}

/**
 * Runs the checks with the picker and menus, letting the time they wait for pass.
 *
 * @returns The checks, by id.
 */
async function runInteractive(): Promise<Record<string, string>> {
  const done = runChecks(true);

  await vi.advanceTimersByTimeAsync(10_000);

  return statuses(await done);
}

describe("the picker, opened to check it", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("opens from the emoji button, has the Nitfree tab, and closes on Escape", async () => {
    mount(COMPOSER);

    const discord = playPicker();
    const checks = await runInteractive();

    expect(checks).toMatchObject({ pickerTabList: "ok", pickerTabLook: "ok", pickerTab: "ok" });
    expect(discord.clicks()).toBe(1);
    expect(document.querySelector("[role=tablist]")).toBeNull();
  });

  it("gets Escape from the page when nothing has focus", async () => {
    mount(COMPOSER);
    vi.spyOn(document, "activeElement", "get").mockReturnValue(null);

    const discord = playPicker();
    const pressed: EventTarget[] = [];

    listen("keydown", event => void pressed.push(event.target!));
    await runInteractive();

    expect(pressed).toEqual([document.body]);
    expect(discord.clicks()).toBe(1);
  });

  it("closes from its button when Escape does not reach it", async () => {
    mount(COMPOSER);

    const discord = playPicker({ escapes: false });

    expect(await runInteractive()).toMatchObject({ pickerTabList: "ok", pickerTab: "ok" });
    expect(discord.clicks()).toBe(2);
    expect(document.querySelector("[role=tablist]")).toBeNull();
  });

  it("is missing when it does not open, and the Nitfree tab when Nitfree does not add it", async () => {
    mount(COMPOSER);

    const discord = playPicker({ opens: false });

    expect(await runInteractive()).toMatchObject({ pickerTabList: "missing", pickerTabLook: "skipped", pickerTab: "skipped" });
    expect(discord.clicks()).toBe(1);

    mount(COMPOSER);
    playPicker({ tab: false });
    expect(await runInteractive()).toMatchObject({ pickerTabList: "ok", pickerTabLook: "ok", pickerTab: "missing" });
  });

  it("is checked as soon as the Nitfree tab shows, before Discord may close it", async () => {
    mount(COMPOSER);
    playPicker({ lingers: 100 });

    expect(await runInteractive()).toMatchObject({ pickerTabList: "ok", pickerTabLook: "ok", pickerTab: "ok" });
  });

  it("waits no longer than Discord takes to open it", async () => {
    mount(COMPOSER);
    playPicker({ opens: false });

    const done = runChecks(true);

    await vi.advanceTimersByTimeAsync(1999);

    let settled = false;

    void done.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled).toBe(true);
  });

  it("is left open when it already was", async () => {
    mount(`${COMPOSER}${PICKER}`);

    const discord = playPicker();

    expect(await runInteractive()).toMatchObject({ pickerTabList: "ok", pickerTabLook: "ok", pickerTab: "missing" });
    expect(discord.clicks()).toBe(0);
    expect(document.querySelector("[role=tablist]")).not.toBeNull();
  });

  it("is skipped without an emoji button to open it", async () => {
    expect(await runInteractive()).toMatchObject({ pickerTabList: "skipped", pickerTabLook: "skipped", pickerTab: "skipped" });

    mount("<form><div role=\"textbox\" contenteditable=\"true\"></div><div class=\"buttons_a\"></div></form>");
    expect(await runInteractive()).toMatchObject({ pickerTabList: "skipped" });
  });
});

/**
 * Plays Discord's message menu: a right click opens it, its items a moment later, Escape in it
 * closes it, and Nitfree adds its item.
 *
 * @param options - How the stand-in behaves.
 * @param options.opens - Whether a right click opens the menu.
 * @param options.save - Whether Nitfree adds its item.
 * @param options.items - Whether the menu shows its items, or closes first.
 * @param options.markup - The menu, with its items.
 * @returns The right clicks Discord received.
 */
function playMenu({ opens = true, save = true, items = true, markup = MENU } = {}): { clicks: MouseEvent[] } {
  const clicks: MouseEvent[] = [];

  listen("contextmenu", (event) => {
    clicks.push(event);

    if (!opens) {
      return;
    }

    document.body.insertAdjacentHTML("beforeend", "<div role=\"menu\" id=\"opened\"></div>");

    const menu = q("#opened");

    menu.addEventListener("keydown", event => event.key === "Escape" && menu.remove());
    setTimeout(() => {
      if (!items) {
        menu.remove();

        return;
      }

      menu.innerHTML = markup.replace(/^<div role="menu">|<\/div>$/g, "");

      if (save) {
        menu.insertAdjacentHTML("afterbegin", "<div role=\"group\" data-nitfree-save></div>");
      }
    }, 200);
  });

  return { clicks };
}

describe("the message menu, opened to check it", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("opens on an emoji in the channel, centered on it, with Nitfree's item, and closes on Escape", async () => {
    mount(`${STICKER}${IMAGE}<img data-type="emoji" data-id="1">`);
    vi.spyOn(q("[data-type=emoji]"), "getBoundingClientRect").mockReturnValue({ x: 10, y: 20, width: 30, height: 40 } as DOMRect);

    const discord = playMenu();

    expect(await runInteractive()).toMatchObject({ contextMenu: "ok", menuLook: "ok", saveMenuItem: "ok" });
    expect(discord.clicks).toHaveLength(1);

    const [click] = discord.clicks;

    expect(click?.target).toBe(q("[data-type=emoji]"));
    expect(click).toMatchObject({ bubbles: true, cancelable: true, composed: true, button: 2, clientX: 25, clientY: 40 });
    expect(document.querySelector("#opened")).toBeNull();
  });

  it("opens on a sticker, else on an image, when the channel shows no emoji", async () => {
    mount(`${IMAGE}${STICKER}`);

    const discord = playMenu();

    await runInteractive();
    expect(discord.clicks[0]?.target).toBe(q("[data-type=sticker]"));

    mount(IMAGE);
    await runInteractive();
    expect(discord.clicks.at(-1)?.target).toBe(q("[data-role=img]"));
  });

  it("passes over what Nitfree cannot save, such as Discord's animated stickers", async () => {
    mount(`${LOTTIE}${IMAGE}`);

    const discord = playMenu();

    expect(await runInteractive()).toMatchObject({ contextMenu: "ok", saveMenuItem: "ok" });
    expect(discord.clicks[0]?.target).toBe(q("[data-role=img]"));

    mount(LOTTIE);
    expect(await runInteractive()).toMatchObject({ contextMenu: "skipped", menuLook: "skipped", saveMenuItem: "skipped" });
    expect(discord.clicks).toHaveLength(1);
  });

  it("is skipped when the channel shows nothing to open it on", async () => {
    const discord = playMenu();

    expect(await runInteractive()).toMatchObject({ contextMenu: "skipped", menuLook: "skipped", saveMenuItem: "skipped" });
    expect(discord.clicks).toHaveLength(0);
  });

  it("is missing when it does not open, not counting a menu already open", async () => {
    mount(`<img data-type="emoji" data-id="1">${MENU}`);
    playMenu({ opens: false });

    expect(await runInteractive()).toMatchObject({ contextMenu: "missing", menuLook: "skipped", saveMenuItem: "skipped" });
  });

  it("is missing Nitfree's item when Nitfree does not add it", async () => {
    mount("<img data-type=\"emoji\" data-id=\"1\">");
    playMenu({ save: false });
    expect(await runInteractive()).toMatchObject({ contextMenu: "ok", menuLook: "ok", saveMenuItem: "missing" });
  });

  it("needs both the item and label classes for its look, which Discord may rename", async () => {
    mount("<img data-type=\"emoji\" data-id=\"1\">");
    playMenu({ markup: MENU.replace("class=\"label_m\"", "") });
    expect(await runInteractive()).toMatchObject({ menuLook: "missing", saveMenuItem: "ok" });

    listeners.splice(0).forEach(stop => stop());
    mount("<img data-type=\"emoji\" data-id=\"1\">");
    playMenu({ markup: MENU.replace("item_m labelContainer_m colorDefault_m", "") });
    expect(await runInteractive()).toMatchObject({ menuLook: "missing", saveMenuItem: "ok" });
  });

  it("skips its items when Discord closes it before showing them", async () => {
    mount("<img data-type=\"emoji\" data-id=\"1\">");
    playMenu({ items: false });

    expect(await runInteractive()).toMatchObject({ contextMenu: "ok", menuLook: "skipped", saveMenuItem: "skipped" });
  });
});
