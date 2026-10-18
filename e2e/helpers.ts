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

const PAGE = `<!doctype html>
<html class="theme-dark">
  <head>
    <style>
      .theme-dark { --background-base-lower: rgb(30, 31, 34); --text-default: rgb(220, 221, 222); }
      body { margin: 0; height: 100vh; }
      form { position: fixed; right: 0; bottom: 0; left: 0; }
      [class^="buttons_"] { display: flex; justify-content: flex-end; }
    </style>
  </head>
  <body><main id="chat">${COMPOSER}</main><aside id="thread"></aside></body>
</html>`;

/**
 * Opens a stand-in for a Discord channel: the captured composer, and an empty spot for a thread's.
 *
 * @param page - The page to use.
 * @returns Resolves once Nitfree's content script has started.
 */
export async function openDiscord(page: Page): Promise<void> {
  await page.context().route("https://discord.com/**", route => route.fulfill({ contentType: "text/html", body: PAGE }));
  await page.goto("https://discord.com/channels/@me");
  await expect(page.locator("html")).toHaveAttribute("data-nitfree");
}
