import type { TChatMedia } from "~/lib/discord";

import { toError, tryCatch } from "@eoussama/core";

import { findAll, findChatMedia, SELECTORS } from "~/lib/discord";

import { titleFromFileName } from "./drafts";
import { canStartAdd, focusedElement, startAdd } from "./editor.svelte";
import { mountSaveMenuItem } from "./inject";
import { showNotice } from "./notice.svelte";



/**
 * How long after a right click Discord's menu may take to open; the first time, it loads its code.
 */
const MENU_TIMEOUT = 3000;

/**
 * Closes one of Discord's context menus the way Escape does.
 *
 * @param menu - The open menu.
 */
function closeDiscordMenu(menu: Element): void {
  menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
}

async function download(media: TChatMedia): Promise<File> {
  const response = await fetch(media.url);

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }

  const blob = await response.blob();

  return new File([blob], media.name, { type: blob.type });
}

/**
 * Downloads what was right-clicked and opens the add dialog with it, its type and its name filled
 * in, so tags can be added before saving. A notice says once it is saved, or why it could not be.
 *
 * @param media - What to save.
 * @returns Once the dialog shows the file, or the failure is shown.
 */
async function save(media: TChatMedia): Promise<void> {
  const title = media.type === "emoji" || media.type === "sticker" ? media.name : titleFromFileName(media.name);

  if (!canStartAdd()) {
    showNotice(i18n.t("save.busy"));

    return;
  }

  const [error, file] = await tryCatch(download(media));

  if (error) {
    showNotice(i18n.t("save.failed", { title, error: toError(error).message }));

    return;
  }

  await startAdd([file], focusedElement(), {
    title,
    type: media.type,
    onsaved: saved => showNotice(i18n.t("save.saved", { title: saved })),
  });
}

/**
 * Adds "Save to Nitfree" to the menu Discord opens on a right click on a custom emoji, a sticker or
 * an image in a message.
 *
 * @returns A function that stops it and removes the item.
 */
export function followSaveFromChat(): () => void {
  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeItem: (() => void) | null = null;

  function stopWaiting(): void {
    observer?.disconnect();
    observer = null;
    clearTimeout(timer);
  }

  function clear(): void {
    removeItem?.();
    removeItem = null;
  }

  // Waits for the menu this right click opens, ignoring any menu that was already open.
  function onContextMenu(event: MouseEvent): void {
    stopWaiting();

    const target = event.composedPath()[0];
    const media = target instanceof Element ? findChatMedia(target) : null;

    if (!media) {
      return;
    }

    const stale = new Set(findAll(document, SELECTORS.contextMenu));

    const check = (): void => {
      const menu = findAll(document, SELECTORS.contextMenu).find(found => !stale.has(found));
      const remove = menu && mountSaveMenuItem(menu, () => {
        closeDiscordMenu(menu);
        void save(media);
      });

      if (remove) {
        stopWaiting();
        clear();
        removeItem = remove;
      }
    };

    observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(stopWaiting, MENU_TIMEOUT);
  }

  // Before Discord's own listeners, which stop the event once they open their menu.
  window.addEventListener("contextmenu", onContextMenu, true);

  return () => {
    window.removeEventListener("contextmenu", onContextMenu, true);
    stopWaiting();
    clear();
  };
}
