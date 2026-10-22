import type { ContentScriptContext } from "#imports";

import type { TItem } from "~/lib/db";

import { mount, unmount } from "svelte";

import Overlay from "~/components/Overlay.svelte";
import Popover from "~/components/Popover.svelte";
import SaveMenuItem from "~/components/SaveMenuItem.svelte";
import Toggler from "~/components/Toggler.svelte";
import { findChatButtonGroups, readChatButtonClasses, readMenuLook } from "~/lib/discord";

import { isolate } from "./isolate";
import { closePanel, panel } from "./panel.svelte";



const MARKER = ":scope > [data-nitfree-toggler]";

/**
 * Puts a Nitfree button first in a composer's button group.
 *
 * @param group - The composer's button group.
 * @returns A function that removes the button.
 */
export function mountToggler(group: Element): () => void {
  const component = mount(Toggler, {
    target: group,
    anchor: group.firstChild ?? undefined,
    props: { classes: readChatButtonClasses(group) },
  });

  return () => {
    void unmount(component);
  };
}

/**
 * Puts "Save to Nitfree" first in one of Discord's context menus, once it shows its items.
 *
 * @param menu - The open menu.
 * @param onselect - What choosing the item does.
 * @returns A function that removes the item, or null when the menu has no items yet.
 */
export function mountSaveMenuItem(menu: Element, onselect: () => void): (() => void) | null {
  const group = menu.querySelector("[role=\"group\"]");

  if (!group?.parentElement) {
    return null;
  }

  const component = mount(SaveMenuItem, {
    target: group.parentElement,
    anchor: group,
    props: { look: readMenuLook(menu), onselect },
  });

  return () => {
    void unmount(component);
  };
}

/**
 * Keeps a Nitfree button in every composer: the channel's and any open thread's. Discord re-renders
 * the composer on channel switches, threads, DMs and edits, so the page is watched and the button
 * put back whenever it goes missing, never twice.
 *
 * @param ctx - The content script's context. Every scan checks it, so the first page change after
 * Nitfree is disabled or updated notices it and runs the content script's cleanup.
 * @param inject - Adds a button to a group and returns how to remove it.
 * @param afterScan - Runs after every scan, for other parts of the page that follow Discord's re-renders.
 * @returns A function that stops watching and removes every button.
 */
export function watchChatButtonGroups(
  ctx: Pick<ContentScriptContext, "isInvalid">,
  inject: (group: Element) => () => void,
  afterScan: () => void = () => undefined,
): () => void {
  const mounted = new Map<Element, () => void>();
  let frame = 0;

  const scan = (): void => {
    frame = 0;

    // Reading it notices a disabled or updated extension and runs the cleanup, which stops this watcher.
    if (ctx.isInvalid) {
      return;
    }

    for (const [group, remove] of mounted) {
      if (!group.isConnected || !group.querySelector(MARKER)) {
        remove();
        mounted.delete(group);
      }
    }

    for (const group of findChatButtonGroups()) {
      if (!mounted.has(group) && !group.querySelector(MARKER)) {
        mounted.set(group, inject(group));
      }
    }

    if (panel.open && panel.mode === "popover" && !panel.anchor?.isConnected) {
      closePanel();
    }

    afterScan();
  };

  // Discord changes the page constantly; one scan per frame is plenty. The plain requestAnimationFrame
  // is used because WXT's version adds a listener to the context on every call and never removes it.
  const observer = new MutationObserver(() => {
    frame ||= requestAnimationFrame(scan);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);

    for (const remove of mounted.values()) {
      remove();
    }

    mounted.clear();
    closePanel();
  };
}

/**
 * Adds the popover's host to the page, in its own shadow root.
 *
 * @param onpick - What picking an item does.
 * @returns A function that removes it.
 */
export function mountPopover(onpick: (item: TItem, send: boolean) => void): () => void {
  const host = document.createElement("div");

  host.dataset.nitfreePanel = "";
  host.style.cssText = "position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;";
  document.body.append(host);

  const component = mount(Popover, { target: host.attachShadow({ mode: "open" }), props: { host, onpick } });
  const release = isolate(host);

  return () => {
    release();
    void unmount(component);
    host.remove();
  };
}

/**
 * Adds the page overlay: the add and edit dialog, the item menu and the undo toast, above everything.
 *
 * @returns A function that removes it.
 */
export function mountOverlay(): () => void {
  const host = document.createElement("div");

  host.dataset.nitfreeOverlay = "";
  host.style.cssText = "position: fixed; inset: 0; z-index: 2147483001; pointer-events: none;";
  document.body.append(host);

  const component = mount(Overlay, { target: host.attachShadow({ mode: "open" }), props: { host } });
  // Working in the dialog must not count as a click outside Discord's picker, nor let the picker
  // take focus back from its fields.
  const release = isolate(host, { pointer: true, focus: true });

  return () => {
    release();
    void unmount(component);
    host.remove();
  };
}
