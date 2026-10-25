import type { Page } from "@playwright/test";

import { canSetLanguage, expect, test } from "./fixtures";



const DISCORD_URL = "https://discord.com/channels/@me";
const MARKETING_URL = "https://discord.com/nitro";

/**
 * A stand-in for Discord's app: the theme class on <html> and a few of its design tokens.
 */
const APP_PAGE = `<!doctype html>
<html class="theme-light">
  <head>
    <style>
      .theme-light { --background-primary: rgb(250, 250, 250); --text-normal: rgb(10, 10, 10); }
      .theme-dark { --background-primary: rgb(30, 31, 34); --text-normal: rgb(220, 221, 222); }
    </style>
    <style id="client-theme"></style>
  </head>
  <body></body>
</html>`;

/**
 * A stand-in for Discord's marketing pages, which carry no theme.
 */
const MARKETING_PAGE = "<!doctype html><html><head></head><body></body></html>";

async function openDiscord(page: Page, url = DISCORD_URL): Promise<void> {
  await page.context().route("https://discord.com/**", route => route.fulfill({
    contentType: "text/html",
    body: new URL(route.request().url()).pathname.startsWith("/channels/") ? APP_PAGE : MARKETING_PAGE,
  }));
  await page.goto(url);
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
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test.describe("in french", () => {
  test.use({ locale: "fr-FR" });
  test.skip(!canSetLanguage, "The browser's language cannot be set on macOS.");

  test("popup renders in french", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(page.getByRole("img", { name: "Logo de Nitfree" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });
});

test.describe("in an unsupported language", () => {
  test.use({ locale: "de-DE" });

  test("popup falls back to english and says so", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(page.getByRole("img", { name: "Nitfree logo" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
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

test("client themes that edit an existing style are picked up", async ({ page }) => {
  await openDiscord(page);
  await expect.poll(() => rootVariable(page, "--nf-bg")).toBe("rgb(250, 250, 250)");

  await page.evaluate(() => {
    const style = document.getElementById("client-theme");

    if (style) {
      style.textContent = ".theme-light { --background-primary: rgb(1, 2, 3); }";
    }
  });

  await expect.poll(() => rootVariable(page, "--nf-bg")).toBe("rgb(1, 2, 3)");
});

test("pages without a discord theme leave the stored palette alone", async ({ context, page, extensionId }) => {
  await openDiscord(page);
  await page.evaluate(() => document.documentElement.classList.replace("theme-light", "theme-dark"));
  await expect.poll(() => rootVariable(page, "--nf-bg")).toBe("rgb(30, 31, 34)");

  const marketing = await context.newPage();

  await openDiscord(marketing, MARKETING_URL);
  expect(await rootVariable(marketing, "--nf-bg")).toBe("");

  const popup = await context.newPage();

  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.locator("body")).toHaveCSS("background-color", "rgb(30, 31, 34)");
});
