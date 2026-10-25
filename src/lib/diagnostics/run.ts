import type { TCheck, TDiagnostics } from "./types";

import { tryCatch } from "@eoussama/core";

import { DISCORD_MATCHES } from "~/lib/discord";
import { sendMessage, sendTabMessage } from "~/lib/messaging";



async function works(task: () => Promise<unknown>): Promise<boolean> {
  const [error] = await tryCatch(task);

  return !error;
}

/**
 * Finds the Discord tab to check: the one shown in this window, else the first one open.
 *
 * @returns The tab's id, or null when no Discord tab is open.
 */
export async function findDiscordTab(): Promise<number | null> {
  const [shown] = await browser.tabs.query({ active: true, currentWindow: true, url: DISCORD_MATCHES });
  const tab = shown ?? (await browser.tabs.query({ url: DISCORD_MATCHES }))[0];

  return tab?.id ?? null;
}

/**
 * Checks that Nitfree works: its background and library, then, in a Discord tab, everything it uses
 * on Discord's page.
 *
 * @param interactive - Whether to open Discord's picker and a message menu to check them.
 * @returns Where the checks ran, and how each went.
 */
export async function runDiagnostics(interactive: boolean): Promise<TDiagnostics> {
  const [background, library, tabId] = await Promise.all([
    works(() => sendMessage("runtime:ping")),
    // The smallest read of the database.
    works(() => sendMessage("tags:list")),
    findDiscordTab(),
  ]);
  const extension: TCheck[] = [
    { id: "background", status: background ? "ok" : "missing" },
    { id: "library", status: library ? "ok" : "missing" },
  ];

  if (tabId === null) {
    return { tab: "none", checks: [...extension, { id: "content", status: "skipped" }] };
  }

  const [error, page] = await tryCatch(sendTabMessage(tabId, "diagnostics:run", { interactive }));

  if (error) {
    return { tab: "unreachable", checks: [...extension, { id: "content", status: "missing" }] };
  }

  return { tab: "found", checks: [...extension, { id: "content", status: "ok" }, ...page] };
}
