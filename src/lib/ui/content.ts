import type { ContentScriptContext } from "#imports";

import type { TItem } from "~/lib/db";

import { findAll, SELECTORS } from "~/lib/discord";

import { mountPopover, mountToggler, watchChatButtonGroups } from "./inject";
import { followLibrary } from "./library.svelte";
import { closePanel, openPanel, panel, setToggleHandler, togglePopover, wasOpenFor } from "./panel.svelte";
import { createPickerTab } from "./picker";



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

function composerOf(anchor: HTMLElement): Element | null {
  return anchor.closest(SELECTORS.chatButtonGroup.join(","));
}

function emojiButtonOf(anchor: HTMLElement): HTMLElement | null {
  const group = composerOf(anchor);

  return group ? (findAll(group, SELECTORS.emojiButton)[0] as HTMLElement | undefined) ?? null : null;
}

/**
 * The chat bar button of the composer whose picker is open, for when the Nitfree tab is chosen
 * from the picker itself.
 *
 * @returns The button, or null.
 */
function anchorOfOpenPicker(): HTMLElement | null {
  const expanded = findAll(document, SELECTORS.emojiButton).find(button => button.getAttribute("aria-expanded") === "true");
  const group = expanded?.closest(SELECTORS.chatButtonGroup.join(","));

  return group?.querySelector<HTMLElement>("[data-nitfree-toggler] [role=\"button\"]") ?? null;
}

/**
 * Starts everything Nitfree adds to Discord's page: the chat bar buttons, the Nitfree tab in the
 * expression picker, the fallback popover and the live library they show.
 *
 * @param ctx - The content script's context.
 * @returns A function that removes it all.
 */
export function startContent(ctx: ContentScriptContext): () => void {
  let pending: { anchor: HTMLElement; timer: number } | null = null;

  const stopLibrary = followLibrary();
  const removePopover = mountPopover(pick);

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

  function closeDiscordPicker(anchor: HTMLElement | null): void {
    picker.deselect();

    const target = document.activeElement ?? document.body;

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));

    // If Escape did not reach Discord's picker, its emoji button closes it.
    ctx.requestAnimationFrame(() => {
      if (picker.isOpen() && anchor) {
        emojiButtonOf(anchor)?.click();
      }
    });
  }

  function toggle(anchor: HTMLElement): void {
    cancelPending();

    if (wasOpenFor(anchor)) {
      // Discord may already have closed its picker on the press, as it does for any press outside it.
      if (picker.isOpen()) {
        closeDiscordPicker(anchor);
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
      timer: ctx.setTimeout(() => {
        if (pending?.anchor === anchor) {
          pending = null;
          openPanel("popover", anchor);
        }
      }, PICKER_TIMEOUT),
    };

    emoji.click();
  }

  function afterScan(): void {
    picker.scan();

    if (pending && picker.isOpen()) {
      const { anchor } = pending;

      cancelPending();

      if (picker.select()) {
        openPanel("picker", anchor);
      }
      else {
        openPanel("popover", anchor);
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
    removePopover();
    stopLibrary();
  };
}
