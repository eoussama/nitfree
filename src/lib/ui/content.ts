import type { ContentScriptContext } from "#imports";

import type { TItem } from "~/lib/db";

import { chatButtonGroupOf, findEmojiButton, findExpandedPickerButton } from "~/lib/discord";

import { resetEditor } from "./editor.svelte";
import { mountOverlay, mountPopover, mountToggler, watchChatButtonGroups } from "./inject";
import { followLibrary } from "./library.svelte";
import { closeMenu } from "./menu.svelte";
import { closePanel, openPanel, panel, setToggleHandler, togglePopover, wasOpenFor } from "./panel.svelte";
import { createPickerTab } from "./picker";
import { flushTrash } from "./trash.svelte";



/**
 * How long to wait for Discord's picker after asking it to open, before using the popover instead.
 */
const PICKER_TIMEOUT = 600;

/**
 * What picking a library item does. Sending lands with #42 and #43; until then picking does nothing.
 *
 * @param _item - The picked item.
 * @param _send - True for a click (send), false for a Shift+click (insert without sending).
 */
function pick(_item: TItem, _send: boolean): void {}

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
    removeOverlay();
    removePopover();
    stopLibrary();
  };
}
