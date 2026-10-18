import type { BrowserContext } from "@playwright/test";

import path from "node:path";
import process from "node:process";
import { test as base, chromium } from "@playwright/test";



const EXTENSION_PATH = path.resolve(import.meta.dirname, "../.output/chrome-mv3");

type TFixtures = {
  context: BrowserContext;
  extensionId: string;
};

/**
 * Loads the built Chrome extension into a fresh Chromium profile, in the browser language set by `locale`.
 * Set `E2E_CHANNEL=msedge` to use an installed Edge where Playwright's Chromium cannot start.
 */
export const test = base.extend<TFixtures>({
  context: async ({ locale }, use) => {
    const language = locale ?? "en-US";
    const context = await chromium.launchPersistentContext("", {
      channel: process.env.E2E_CHANNEL ?? "chromium",
      locale: language,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        `--lang=${language}`,
      ],
    });

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");

    await use(new URL(worker.url()).host);
  },
});

export const { expect } = test;
