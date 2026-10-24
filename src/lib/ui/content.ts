import type { ContentScriptContext } from "#imports";

import type { TItem } from "~/lib/db";

import { toError, tryCatch } from "@eoussama/core";

import { chatButtonGroupOf, composerOf, findEmojiButton, findExpandedPickerButton } from "~/lib/discord";
import { sendMessage } from "~/lib/messaging";
import { picksSend } from "~/lib/settings";
import { matchesShortcut } from "~/lib/shortcut";

import { editor, resetEditor } from "./editor.svelte";
import { mountOverlay, mountPopover, mountToggler, watchChatButtonGroups } from "./inject";
import { followLibrary } from "./library.svelte";
import { closeMenu } from "./menu.svelte";
import { clearNotice, showNotice } from "./notice.svelte";
import { closePanel, openPanel, panel, setToggleHandler, togglePopover, wasOpenFor } from "./panel.svelte";
import { createPickerTab } from "./picker";
import { followPreferences, preferences } from "./preferences.svelte";
import { followSaveFromChat } from "./save";
import { attachFile, prepareFile, SendError } from "./send";
import { followSuggestions } from "./suggest.svelte";
import { flushTrash } from "./trash.svelte";



/**
 * How long to wait for Discord's picker after asking it to open, before using the popover instead.
 */
const PICKER_TIMEOUT = 600;

/**
 * The Nitfree button in a composer's button group.
 */
const TOGGLER = "[data-nitfree-toggler] [role=\"button\"]";

function emojiButtonOf(anchor: HTMLElement): HTMLElement | null {
  const group = chatButtonGroupOf(anchor);

  return group ? findEmojiButton(group) : null;
}

/**
 * The Nitfree button of the composer whose picker is open, for when the Nitfree tab is chosen from
 * the picker itself. Discord marks the GIF, sticker or emoji button that opened it as expanded.
 *
 * @returns The button, or null.
 */
function anchorOfOpenPicker(): HTMLElement | null {
  const expanded = findExpandedPickerButton();
  const group = expanded && chatButtonGroupOf(expanded);

  return group?.querySelector<HTMLElement>(TOGGLER) ?? null;
}

/**
 * The Nitfree button the keyboard shortcut stands for: the one the panel is open for, else the one of
 * the composer being typed in, such as a thread's, else the channel's, which comes first on the page.
 *
 * @returns The button, or null when no composer is shown.
 */
function shortcutAnchor(): HTMLElement | null {
  // Stryker disable next-line OptionalChaining: an open panel always has its button.
  if (panel.open && panel.anchor?.isConnected) {
    return panel.anchor;
  }

  const composer = document.activeElement && composerOf(document.activeElement);

  return composer?.querySelector<HTMLElement>(TOGGLER) ?? document.querySelector<HTMLElement>(TOGGLER);
}

/**
 * Starts everything Nitfree adds to Discord's page: the chat bar buttons and their keyboard shortcut, the Nitfree tab in the
 * expression picker, the fallback popover, "Save to Nitfree" in message menus, the emojis suggested
 * while typing `:name`, and the live library they show.
 *
 * @param ctx - The content script's context.
 * @returns A function that removes it all.
 */
export function startContent(ctx: Pick<ContentScriptContext, "isInvalid">): () => void {
  let pending: { anchor: HTMLElement; emoji: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;

  // Picks waiting their turn, and the items they are for.
  let queue = Promise.resolve();
  const picking = new Set<string>();

  const stopLibrary = followLibrary();
  const stopPreferences = followPreferences();
  const removePopover = mountPopover(pick);
  const removeOverlay = mountOverlay();
  const stopSaving = followSaveFromChat();
  const stopSuggestions = followSuggestions((item, send, composer) => enqueue(item, send, composer));

  // Deletions waiting for their undo delay are made final when the page goes away.
  window.addEventListener("pagehide", flushTrash);

  const picker = createPickerTab({
    onpick: pick,
    onchange: (selected) => {
      // Stryker disable next-line ConditionalExpression,StringLiteral: opening the picker panel again, or then closing it, leaves it as it was.
      if (selected && panel.mode !== "picker") {
        openPanel("picker", panel.anchor ?? anchorOfOpenPicker());
      }

      if (!selected && panel.mode === "picker") {
        closePanel();
      }
    },
  });

  function cancelPending(): void {
    if (pending) {
      // Stryker disable next-line CallExpression: a timer left running finds nothing pending for it.
      clearTimeout(pending.timer);
      pending = null;
    }
  }

  function closeDiscordPicker(): void {
    picker.deselect();

    const target = document.activeElement ?? document.body;

    // Stryker disable next-line StringLiteral,BooleanLiteral: Discord reads only the key, which the tests check; the rest is for other listeners.
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));

    // If Escape did not reach Discord's picker, the button of the tab it is showing closes it.
    requestAnimationFrame(() => {
      if (picker.isOpen()) {
        findExpandedPickerButton()?.click();
      }
    });
  }

  /**
   * Puts a picked item in its composer once it is ready, unless the user has moved to another
   * channel meanwhile.
   *
   * @param item - The picked item.
   * @param send - Whether to send the message.
   * @param composer - The composer the panel was opened from.
   * @param path - The page's path when the item was picked.
   * @returns Resolves once the item is in the composer, or the failure is shown.
   */
  async function deliver(item: TItem, send: boolean, composer: Element, path: string): Promise<void> {
    const [error] = await tryCatch(async () => {
      const file = await prepareFile(item);

      if (ctx.isInvalid) {
        return;
      }

      if (!composer.isConnected || location.pathname !== path) {
        throw new SendError(i18n.t("send.moved", { title: item.title }));
      }

      await attachFile(composer, file, { send, title: item.title });
    });

    if (error) {
      showNotice(error instanceof SendError ? error.message : i18n.t("send.failed", { title: item.title, error: toError(error).message }));

      return;
    }

    void sendMessage("library:use", { id: item.id }).catch(() => undefined);
  }

  /**
   * Picks a library item for the composer the panel was opened from. By default a click sends it and
   * closes the panel, like Discord's sticker and GIF pickers, and a Shift+click adds it to the message
   * and keeps the panel open for more; the popup can swap the two. Picks go one after another, so each
   * file joins the message it was meant for, and picking an item that is still on its way does
   * nothing. Failures are said in a notice.
   *
   * @param item - The picked item.
   * @param primary - True for a click, false for a Shift+click.
   */
  function pick(item: TItem, primary: boolean): void {
    const send = picksSend(primary, preferences.clickAction);
    const composer = panel.anchor ? composerOf(panel.anchor) : null;

    if (!composer) {
      showNotice(i18n.t("send.noComposer"));

      return;
    }

    if (send) {
      if (picker.isOpen()) {
        closeDiscordPicker();
      }

      closePanel();
    }

    enqueue(item, send, composer);
  }

  /**
   * Puts an item in a composer after the picks before it, unless it is still on its way.
   *
   * @param item - The picked item.
   * @param send - Whether to send the message.
   * @param composer - The composer to put it in.
   */
  function enqueue(item: TItem, send: boolean, composer: Element): void {
    if (picking.has(item.id)) {
      return;
    }

    const path = location.pathname;

    picking.add(item.id);
    queue = queue.then(() => deliver(item, send, composer, path)).finally(() => picking.delete(item.id));
  }

  /**
   * Shows the popover instead, first closing whatever the emoji button opened that Nitfree cannot use.
   *
   * @param anchor - The Nitfree button that was clicked.
   * @param emoji - The emoji button that was clicked on its behalf.
   */
  function fallBackToPopover(anchor: HTMLElement, emoji: HTMLElement): void {
    if (emoji.getAttribute("aria-expanded") === "true") {
      emoji.click();
    }

    openPanel("popover", anchor);
  }

  function toggle(anchor: HTMLElement): void {
    // Stryker disable next-line CallExpression: a wait left for another button finds the panel's anchor changed.
    cancelPending();

    if (wasOpenFor(anchor)) {
      // Discord may already have closed its picker on the press, as it does for any press outside it.
      if (picker.isOpen()) {
        closeDiscordPicker();
      }

      closePanel();

      return;
    }

    // Stryker disable next-line all: opening the panel elsewhere replaces the popover anyway; this only closes it first.
    if (panel.mode === "popover") {
      closePanel();
    }

    // Stryker disable next-line LogicalOperator: a closed picker has no tab to select.
    if (picker.isOpen() && picker.select()) {
      openPanel("picker", anchor);

      return;
    }

    const emoji = emojiButtonOf(anchor);

    if (!emoji) {
      togglePopover(anchor);

      return;
    }

    pending = {
      anchor,
      emoji,
      timer: setTimeout(() => {
        // Stryker disable next-line ConditionalExpression,OptionalChaining: a wait that ended is cleared, so its timer does not run.
        if (pending?.anchor === anchor && !ctx.isInvalid) {
          pending = null;
          fallBackToPopover(anchor, emoji);
        }
      }, PICKER_TIMEOUT),
    };

    emoji.click();
  }

  function afterScan(): void {
    picker.scan();

    if (pending && picker.isOpen()) {
      const { anchor, emoji } = pending;

      cancelPending();

      if (picker.select()) {
        openPanel("picker", anchor);
      }
      else {
        fallBackToPopover(anchor, emoji);
      }
    }
  }

  /**
   * Opens the panel from the keyboard, as a click on the Nitfree button would, or closes it when it is
   * open. Listens before Discord does, so the combination goes no further.
   *
   * @param event - A key press anywhere on the page.
   */
  function onShortcut(event: KeyboardEvent): void {
    // AltGr counts as Ctrl+Alt on Windows, and with N types ń on a Polish keyboard: that is typing.
    if (!preferences.shortcut || event.repeat || event.isComposing || editor.mode || event.getModifierState("AltGraph") || !matchesShortcut(event, preferences.shortcut)) {
      return;
    }

    const anchor = shortcutAnchor();

    if (!anchor) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    // As a click would: focus leaves the message box first, so Discord's picker, which keeps focus
    // inside while open, does not take it back from the search field.
    anchor.focus();
    toggle(anchor);
  }

  setToggleHandler(toggle);

  const stopTogglers = watchChatButtonGroups(ctx, mountToggler, afterScan);

  window.addEventListener("keydown", onShortcut, true);

  return () => {
    // Stryker disable next-line BooleanLiteral: happy-dom removes a listener whatever its capture flag, as browsers do not.
    window.removeEventListener("keydown", onShortcut, true);
    cancelPending();
    setToggleHandler(togglePopover);
    stopTogglers();
    picker.stop();
    window.removeEventListener("pagehide", flushTrash);
    flushTrash();
    stopSaving();
    stopSuggestions();
    resetEditor();
    // Stryker disable next-line all: the menu's own tests close it; here it only matters with a menu open as Nitfree goes.
    closeMenu();
    clearNotice();
    removeOverlay();
    removePopover();
    // Stryker disable next-line all: the preferences' own tests stop following; nothing here reads them once stopped.
    stopPreferences();
    stopLibrary();
  };
}
