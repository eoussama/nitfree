import type { ContentScriptContext } from "#imports";

import type { TItem } from "~/lib/db";

import { toError, tryCatch } from "@eoussama/core";

import { chatButtonGroupOf, composerOf, findEmojiButton, findExpandedPickerButton } from "~/lib/discord";
import { sendMessage } from "~/lib/messaging";

import { resetEditor } from "./editor.svelte";
import { mountOverlay, mountPopover, mountToggler, watchChatButtonGroups } from "./inject";
import { followLibrary } from "./library.svelte";
import { closeMenu } from "./menu.svelte";
import { clearNotice, showNotice } from "./notice.svelte";
import { closePanel, openPanel, panel, setToggleHandler, togglePopover, wasOpenFor } from "./panel.svelte";
import { createPickerTab } from "./picker";
import { attachFile, prepareFile, SendError } from "./send";
import { flushTrash } from "./trash.svelte";



/**
 * How long to wait for Discord's picker after asking it to open, before using the popover instead.
 */
const PICKER_TIMEOUT = 600;

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

  return group?.querySelector<HTMLElement>("[data-nitfree-toggler] [role=\"button\"]") ?? null;
}

/**
 * Starts everything Nitfree adds to Discord's page: the chat bar buttons, the Nitfree tab in the
 * expression picker, the fallback popover and the live library they show.
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
  const removePopover = mountPopover(pick);
  const removeOverlay = mountOverlay();

  // Deletions waiting for their undo delay are made final when the page goes away.
  window.addEventListener("pagehide", flushTrash);

  const picker = createPickerTab({
    onpick: pick,
    onchange: (selected) => {
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
      clearTimeout(pending.timer);
      pending = null;
    }
  }

  function closeDiscordPicker(): void {
    picker.deselect();

    const target = document.activeElement ?? document.body;

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
   * Picks a library item for the composer the panel was opened from. A click sends it and closes the
   * panel, like Discord's sticker and GIF pickers; a Shift+click adds it to the message and keeps the
   * panel open for more. Picks go one after another, so each file joins the message it was meant
   * for, and picking an item that is still on its way does nothing. Failures are said in a notice.
   *
   * @param item - The picked item.
   * @param send - True for a click, false for a Shift+click.
   */
  function pick(item: TItem, send: boolean): void {
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
    cancelPending();

    if (wasOpenFor(anchor)) {
      // Discord may already have closed its picker on the press, as it does for any press outside it.
      if (picker.isOpen()) {
        closeDiscordPicker();
      }

      closePanel();

      return;
    }

    if (panel.mode === "popover") {
      closePanel();
    }

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

  setToggleHandler(toggle);

  const stopTogglers = watchChatButtonGroups(ctx, mountToggler, afterScan);

  return () => {
    cancelPending();
    setToggleHandler(togglePopover);
    stopTogglers();
    picker.stop();
    window.removeEventListener("pagehide", flushTrash);
    flushTrash();
    resetEditor();
    closeMenu();
    clearNotice();
    removeOverlay();
    removePopover();
    stopLibrary();
  };
}
