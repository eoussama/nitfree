import type { TCheck, TCheckId, TCheckStatus } from "./types";

import { findAll, findChatButtonGroups, findChatMedia, findEmojiButton, readChatButtonClasses, readMenuLook, readPickerTabClasses, SELECTORS } from "~/lib/discord";
import { readTheme } from "~/lib/theme";

import { CHECK_GROUPS } from "./types";



/**
 * A channel's or a DM's page, where Discord shows a message box unless the channel cannot be written in.
 */
const CHANNEL_PATH = /^\/channels\/[^/]+\/\d+(?:\/|$)/;

/**
 * The Nitfree tab in Discord's expression picker, and Nitfree's item in its menus.
 */
const PICKER_TAB = "nitfree-picker-tab";
const SAVE_ITEM = "[data-nitfree-save]";

/**
 * How long Discord may take to open its picker, and to close it on Escape before its button is used.
 */
const PICKER_TIMEOUT = 2000;
const CLOSE_TIMEOUT = 300;

/**
 * How long Nitfree may take to add its tab once the picker shows: one scan of the page.
 */
const TAB_TIMEOUT = 500;

/**
 * How long Discord's menu may take to open, and to show its items; the first time, it loads its code.
 */
const MENU_TIMEOUT = 3000;

type TProbe = { check: TCheck; found: Element[] };

/**
 * Tries a selector's alternatives in order, as `findAll` does, and tells which one matched.
 *
 * @param id - The check.
 * @param root - Where to look.
 * @param selectors - The alternatives, most specific first.
 * @param absent - What finding nothing means: missing, or skipped when it may rightly be absent.
 * @returns The check, and what the matching alternative found.
 */
export function probe(id: TCheckId, root: ParentNode, selectors: readonly string[], absent: TCheckStatus = "missing"): TProbe {
  for (const [index, selector] of selectors.entries()) {
    const found = [...root.querySelectorAll(selector)];

    if (found.length) {
      const check: TCheck = index ? { id, status: "fallback", alternative: { used: index + 1, of: selectors.length } } : { id, status: "ok" };

      return { check, found };
    }
  }

  return { check: { id, status: absent }, found: [] };
}

function skip(id: TCheckId): TCheck {
  return { id, status: "skipped" };
}

function verdict(id: TCheckId, ok: boolean): TCheck {
  return { id, status: ok ? "ok" : "missing" };
}

function escape(target: EventTarget): void {
  // Stryker disable next-line StringLiteral,BooleanLiteral: Discord reads only the key, which the tests check; the rest is for other listeners.
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
}

/**
 * Waits for something to show on the page.
 *
 * @param read - Finds it, or gives null while it is not there.
 * @param timeout - How long to wait, in milliseconds.
 * @returns What was found, or null once the time is up.
 */
function waitFor<T>(read: () => T | null | undefined, timeout: number): Promise<T | null> {
  return new Promise((resolve) => {
    const now = read();

    if (now) {
      resolve(now);

      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const observer = new MutationObserver((_, self) => {
      const value = read();

      if (value) {
        // Stryker disable next-line CallExpression: once resolved, more changes or the timer change nothing; this only stops the watching.
        self.disconnect();
        // Stryker disable next-line CallExpression: as above.
        clearTimeout(timer);
        resolve(value);
      }
    });

    timer = setTimeout(() => {
      // Stryker disable next-line CallExpression: as above.
      observer.disconnect();
      resolve(null);
    }, timeout);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Discord's emoji button, which Nitfree's button clicks to open the picker. Without its own selector
 * matching, the last picker button stands in for it, which counts as one more alternative.
 *
 * @param buttons - The composer's button group.
 * @returns The check.
 */
function checkEmojiButton(buttons: Element): TCheck {
  const { check } = probe("emojiButton", buttons, SELECTORS.emojiButton);
  const of = SELECTORS.emojiButton.length + 1;

  return check.status === "missing" && findAll(buttons, SELECTORS.pickerButton).length ? { id: "emojiButton", status: "fallback", alternative: { used: of, of } } : check;
}

/**
 * Checks the message box and what Nitfree uses in it: where it sends files, the chat bar its button
 * joins and the classes that button copies. Pages without a message box, such as the friends list,
 * skip them, but a channel's page should have one.
 *
 * @returns The checks, in the order of their group.
 */
export function checkComposer(): TCheck[] {
  const composer = probe("composer", document, SELECTORS.composer, CHANNEL_PATH.test(location.pathname) ? "missing" : "skipped");
  const [form] = composer.found;

  if (!form) {
    return [composer.check, ...CHECK_GROUPS.composer.slice(1).map(skip)];
  }

  const group = probe("chatButtonGroup", document, SELECTORS.chatButtonGroup);
  const [buttons] = group.found;
  const inGroup = buttons
    ? [
        probe("chatButtonModel", buttons, SELECTORS.chatButtonModel).check,
        verdict("chatButtonLook", Object.values(readChatButtonClasses(buttons)).every(Boolean)),
        probe("pickerButton", buttons, SELECTORS.pickerButton).check,
        checkEmojiButton(buttons),
        verdict("toggler", group.found.every(found => found.querySelector(":scope > [data-nitfree-toggler]") !== null)),
      ]
    : (["chatButtonModel", "chatButtonLook", "pickerButton", "emojiButton", "toggler"] as const).map(skip);

  return [
    composer.check,
    probe("composerBox", document, SELECTORS.composerBox).check,
    probe("messageBox", form, SELECTORS.messageBox).check,
    probe("uploadInput", form, SELECTORS.uploadInput).check,
    group.check,
    ...inGroup,
  ];
}

/**
 * Checks the emojis, stickers and images Nitfree can save from messages. Only the ones in the
 * channel shown can be found, so finding none is not a failure.
 *
 * @returns The checks.
 */
function checkChat(): TCheck[] {
  return [
    probe("chatEmoji", document, SELECTORS.chatEmoji, "skipped").check,
    probe("chatSticker", document, SELECTORS.chatSticker, "skipped").check,
    probe("chatImage", document, SELECTORS.chatImage, "skipped").check,
  ];
}

/**
 * Checks Discord's expression picker, if it is open, and the Nitfree tab in it.
 *
 * @param absent - What a closed picker means: missing once it was asked to open, or skipped.
 * @returns The checks.
 */
function checkOpenPicker(absent: TCheckStatus = "missing"): TCheck[] {
  const tabs = probe("pickerTabList", document, SELECTORS.pickerTabList, absent);
  const [tabList] = tabs.found;

  if (!tabList) {
    return [tabs.check, skip("pickerTabLook"), skip("pickerTab")];
  }

  const look = readPickerTabClasses(tabList);

  return [tabs.check, verdict("pickerTabLook", Boolean(look.base && look.active)), verdict("pickerTab", document.getElementById(PICKER_TAB) !== null)];
}

/**
 * Opens Discord's expression picker from the emoji button, as Nitfree's button does, checks it, and
 * closes it again. A picker that was already open is checked and left open.
 *
 * @returns The checks.
 */
async function checkPicker(): Promise<TCheck[]> {
  const isOpen = (): boolean => findAll(document, SELECTORS.pickerTabList).length > 0;

  if (isOpen()) {
    return checkOpenPicker();
  }

  const [buttons] = findChatButtonGroups();
  const emoji = buttons && findEmojiButton(buttons);

  if (!emoji) {
    return CHECK_GROUPS.picker.map(skip);
  }

  emoji.click();

  if (await waitFor(isOpen, PICKER_TIMEOUT)) {
    await waitFor(() => document.getElementById(PICKER_TAB), TAB_TIMEOUT);
  }

  const checks = checkOpenPicker();

  escape(document.activeElement ?? document.body);

  // If Escape did not reach Discord's picker, the button that opened it closes it.
  if (!await waitFor(() => !isOpen(), CLOSE_TIMEOUT)) {
    emoji.click();
  }

  return checks;
}

/**
 * Opens Discord's menu on an emoji, sticker or image in the channel, as a right click does, checks
 * it and Nitfree's item in it, and closes it again. Only what Nitfree can save gets its item, so
 * Discord's animated stickers, drawn by Lottie, are passed over.
 *
 * @returns The checks, skipped when the channel shows nothing to open it on.
 */
async function checkMenu(): Promise<TCheck[]> {
  const media = [SELECTORS.chatEmoji, SELECTORS.chatSticker, SELECTORS.chatImage]
    .flatMap(selectors => findAll(document, selectors))
    .find(element => findChatMedia(element) !== null);

  if (!media) {
    return CHECK_GROUPS.menu.map(skip);
  }

  const stale = new Set(findAll(document, SELECTORS.contextMenu));
  const box = media.getBoundingClientRect();

  media.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 2,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  }));

  const menu = await waitFor(() => findAll(document, SELECTORS.contextMenu).find(found => !stale.has(found)), MENU_TIMEOUT);

  if (!menu) {
    return [{ id: "contextMenu", status: "missing" }, skip("menuLook"), skip("saveMenuItem")];
  }

  const opened = probe("contextMenu", document, SELECTORS.contextMenu).check;
  const item = await waitFor(() => menu.querySelector(SAVE_ITEM), MENU_TIMEOUT);

  // Discord closed it before showing its items, so they could not be checked.
  if (!item && !menu.isConnected) {
    return [opened, skip("menuLook"), skip("saveMenuItem")];
  }

  const look = readMenuLook(menu);

  escape(menu);

  return [opened, verdict("menuLook", Boolean(look.item && look.label)), verdict("saveMenuItem", item !== null)];
}

/**
 * Checks everything Nitfree uses on Discord's page. The picker and menus only show once opened, so
 * they are skipped unless asked for: opening them is visible, if only for a moment.
 *
 * @param interactive - Whether to open Discord's picker and a message menu to check them.
 * @returns The checks, in the order of their groups.
 */
export async function runChecks(interactive: boolean): Promise<TCheck[]> {
  const page = [...checkComposer(), verdict("theme", readTheme(document.documentElement) !== null), ...checkChat()];

  if (!interactive) {
    return [...page, ...checkOpenPicker("skipped"), ...CHECK_GROUPS.menu.map(skip)];
  }

  return [...page, ...await checkPicker(), ...await checkMenu()];
}
