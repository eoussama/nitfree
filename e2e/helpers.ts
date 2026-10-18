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
 * Plays Discord's part, the way its React app behaves: the emoji and GIF buttons open the picker on
 * their tab, or close it when that tab is already showing; a tab click re-renders the tabs only when
 * the selected tab changes; Escape and any press outside the picker close it.
 */
const PICKER_SCRIPT = `
const PICKER = ${JSON.stringify(PICKER)};
const layers = document.getElementById("layers");
let active = null;

const picker = () => layers.querySelector('[class*="expressionPickerPositionLayer"]');
const button = name => document.querySelector(name === "emoji" ? '[aria-label="Add Emoji"]' : '[aria-label="Open GIF picker"]');

function render() {
  for (const tab of picker().querySelectorAll('[role="tablist"] > [role="tab"]:not([data-nitfree-tab])')) {
    const on = tab.id === active + "-picker-tab";
    tab.className = "navButton__08434 navItem__08434" + (on ? " navButtonActive__08434" : "");
    tab.setAttribute("aria-selected", String(on));
  }
  const panel = picker().querySelector('[role="tabpanel"]:not(#nitfree-picker-tab-panel)');
  panel.id = active + "-picker-tab-panel";
  panel.dataset.discordTab = active;
  panel.setAttribute("aria-labelledby", active + "-picker-tab");
}

function open(name) {
  if (!picker()) layers.insertAdjacentHTML("beforeend", PICKER);
  active = name;
  render();
  for (const which of ["emoji", "gif"]) button(which).setAttribute("aria-expanded", String(which === name));
}

function close() {
  layers.replaceChildren();
  active = null;
  for (const which of ["emoji", "gif"]) button(which).setAttribute("aria-expanded", "false");
}

for (const name of ["emoji", "gif"]) {
  button(name).addEventListener("click", () => (picker() && active === name ? close() : open(name)));
}

layers.addEventListener("click", (event) => {
  const tab = event.target.closest('[role="tab"]');
  const name = tab?.id.replace("-picker-tab", "");
  if (tab && !tab.hasAttribute("data-nitfree-tab") && name !== active) {
    active = name;
    render();
  }
});

document.addEventListener("keydown", event => event.key === "Escape" && picker() && close());
document.addEventListener("pointerdown", (event) => {
  if (picker() && !event.target.closest('[class*="expressionPickerPositionLayer"], .expression-picker-chat-input-button')) close();
});
`;

/**
 * A stand-in Discord channel page.
 *
 * @param picker - Whether Discord's expression picker opens from the emoji and GIF buttons.
 * @returns The page's HTML.
 */
function pageHtml(picker: boolean): string {
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
    ${picker ? `<script>${PICKER_SCRIPT}</script>` : ""}
  </body>
</html>`;
}

/**
 * Opens a stand-in for a Discord channel: the captured composer, and an empty spot for a thread's.
 * Without the picker, the emoji button does nothing, as when Discord's markup no longer matches.
 *
 * @param page - The page to use.
 * @param options - The stand-in's behavior.
 * @param options.picker - Whether Discord's expression picker opens from the emoji and GIF buttons.
 * @returns Resolves once Nitfree's content script has started.
 */
export async function openDiscord(page: Page, { picker = false }: { picker?: boolean } = {}): Promise<void> {
  await page.context().route("https://discord.com/**", route => route.fulfill({ contentType: "text/html", body: pageHtml(picker) }));
  await page.goto("https://discord.com/channels/@me");
  await expect(page.locator("html")).toHaveAttribute("data-nitfree");
}
