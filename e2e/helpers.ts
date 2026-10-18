import type { Page } from "@playwright/test";

import fs from "node:fs";
import path from "node:path";

import { expect } from "./fixtures";



/**
 * A 1x1 PNG, encoded the way the messaging codec sends blobs.
 */
export const PNG = { $nf: "blob", type: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" };

export type TReply<T = unknown> = { ok: boolean; data?: T; error?: { message: string } };

/**
 * Sends a raw request to the background worker from an extension page, as the popup would.
 *
 * @param page - An extension page.
 * @param name - The request name.
 * @param data - The encoded payload.
 * @returns The background's reply.
 */
export async function request<T = unknown>(page: Page, name: string, data?: unknown): Promise<TReply<T>> {
  return page.evaluate(([name, data]) => {
    const { chrome } = globalThis as unknown as { chrome: { runtime: { sendMessage: (message: unknown) => Promise<TReply<T>> } } };

    return chrome.runtime.sendMessage({ channel: "nitfree", kind: "request", name, data });
  }, [name, data] as const);
}

/**
 * Opens the popup page, which can talk to the background like any extension page.
 *
 * @param page - The page to use.
 * @param extensionId - The loaded extension's id.
 * @returns Resolves once the popup has loaded.
 */
export async function openPopup(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
}

/**
 * Discord's composer as captured from discord.com, with text, images and styles stripped.
 */
export const COMPOSER = fs.readFileSync(path.resolve(import.meta.dirname, "fixtures/composer.html"), "utf8");

/**
 * Discord's expression picker as captured from discord.com, with text, images and the emoji lists stripped.
 */
export const PICKER = fs.readFileSync(path.resolve(import.meta.dirname, "fixtures/picker.html"), "utf8");

/**
 * Plays Discord's part on the stand-in page; see the file for how it imitates Discord's React picker.
 */
const PICKER_SCRIPT = fs.readFileSync(path.resolve(import.meta.dirname, "fixtures/discord-picker.js"), "utf8");

type TPicker = boolean | "no-tabs";

/**
 * A stand-in Discord channel page.
 *
 * @param picker - Whether Discord's expression picker opens from the chat bar buttons, and whether it has its tab bar.
 * @returns The page's HTML.
 */
function pageHtml(picker: TPicker): string {
  const script = picker ? `<script>const PICKER = ${JSON.stringify(PICKER)}; const NO_TABS = ${picker === "no-tabs"};\n${PICKER_SCRIPT}</script>` : "";

  return `<!doctype html>
<html class="theme-dark">
  <head>
    <style>
      .theme-dark { --background-base-lower: rgb(30, 31, 34); --text-default: rgb(220, 221, 222); }
      body { margin: 0; height: 100vh; }
      form { position: fixed; right: 0; bottom: 0; left: 0; }
      [class^="buttons_"] { display: flex; justify-content: flex-end; }
      /* Unstyled, the composer is much taller than Discord's; keep the picker clear of its buttons. */
      [class*="expressionPickerPositionLayer"] { position: fixed !important; top: 8px; right: 8px !important; bottom: auto !important; width: 498px; }
      [role="tabpanel"] { height: 426px; }
      /* The captured markup has no text, so give Discord's tabs and buttons a size to click. */
      [role="tablist"] { display: flex; gap: 4px; }
      [role="tab"], [role="button"] { min-width: 24px; min-height: 24px; }
      /* Discord keeps its invisible upload input inside a small positioned box. */
      [class^="fileInput_"] { position: relative; width: 24px; height: 24px; overflow: hidden; }
    </style>
  </head>
  <body>
    <main id="chat">${COMPOSER}</main>
    <aside id="thread"></aside>
    <div id="layers"></div>
    ${script}
  </body>
</html>`;
}

/**
 * Opens a stand-in for a Discord channel: the captured composer, and an empty spot for a thread's.
 * Without the picker, the emoji button does nothing, as when Discord's markup no longer matches.
 *
 * @param page - The page to use.
 * @param options - The stand-in's behavior.
 * @param options.picker - Whether Discord's expression picker opens from the chat bar buttons: true for the
 * captured picker, "no-tabs" for one whose tab bar is gone.
 * @returns Resolves once Nitfree's content script has started.
 */
export async function openDiscord(page: Page, { picker = false }: { picker?: TPicker } = {}): Promise<void> {
  await page.context().route("https://discord.com/**", route => route.fulfill({ contentType: "text/html", body: pageHtml(picker) }));
  await page.goto("https://discord.com/channels/@me");
  await expect(page.locator("html")).toHaveAttribute("data-nitfree");
}
