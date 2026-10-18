import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";



const DISCORD_URL = "https://discord.com/channels/@me";

/**
 * A stand-in for Discord's page: the theme class on <html> and a few of its design tokens.
 */
const DISCORD_PAGE = `<!doctype html>
<html class="theme-light">
  <head>
    <style>
      .theme-light { --background-primary: rgb(250, 250, 250); --text-normal: rgb(10, 10, 10); }
      .theme-dark { --background-primary: rgb(30, 31, 34); --text-normal: rgb(220, 221, 222); }
    </style>
  </head>
  <body></body>
</html>`;

async function openDiscord(page: Page): Promise<void> {
  await page.context().route("https://discord.com/**", route => route.fulfill({ contentType: "text/html", body: DISCORD_PAGE }));
  await page.goto(DISCORD_URL);
  await expect(page.locator("html")).toHaveAttribute("data-nitfree");
}

function rootVariable(page: Page, name: string): Promise<string> {
  return page.evaluate(variable => document.documentElement.style.getPropertyValue(variable), name);
}

test("background answers requests from extension pages", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  const reply = await page.evaluate(() => {
    const { chrome } = globalThis as unknown as { chrome: { runtime: { sendMessage: (message: unknown) => Promise<unknown> } } };

    return chrome.runtime.sendMessage({ channel: "nitfree", kind: "request", name: "runtime:ping" });
  });

  expect(reply).toMatchObject({ ok: true, data: { version: expect.any(String) } });
});

test("popup renders in english", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.getByRole("heading", { name: "Nitfree" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Nitfree logo" })).toBeVisible();
  await expect(page.getByText(/^Version \d+\.\d+\.\d+$/)).toBeVisible();
});

test.describe("in french", () => {
  test.use({ locale: "fr-FR" });

  test("popup renders in french", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(page.getByRole("img", { name: "Logo de Nitfree" })).toBeVisible();
  });
});

test("theme follows discord live and reaches the popup", async ({ context, page, extensionId }) => {
  await openDiscord(page);

  await expect.poll(() => rootVariable(page, "--nf-bg")).toBe("rgb(250, 250, 250)");
  expect(await rootVariable(page, "--nf-text")).toBe("rgb(10, 10, 10)");
  expect(await rootVariable(page, "--nf-accent")).toBe("#5865f2");

  await page.evaluate(() => document.documentElement.classList.replace("theme-light", "theme-dark"));

  await expect.poll(() => rootVariable(page, "--nf-bg")).toBe("rgb(30, 31, 34)");

  const popup = await context.newPage();

  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.locator("body")).toHaveCSS("background-color", "rgb(30, 31, 34)");
  await expect(popup.locator("body")).toHaveCSS("color", "rgb(220, 221, 222)");
});
