import type { Page } from "@playwright/test";

import fs from "node:fs";
import path from "node:path";

import { expect, test } from "./fixtures";



/**
 * Discord's composer as captured from discord.com, with text, images and styles stripped.
 */
const COMPOSER = fs.readFileSync(path.resolve(import.meta.dirname, "fixtures/composer.html"), "utf8");

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

async function openDiscord(page: Page): Promise<void> {
  await page.context().route("https://discord.com/**", route => route.fulfill({ contentType: "text/html", body: PAGE }));
  await page.goto("https://discord.com/channels/@me");
  await expect(page.locator("html")).toHaveAttribute("data-nitfree");
}

const togglers = (page: Page) => page.locator("[data-nitfree-toggler]");
const button = (page: Page) => page.getByRole("button", { name: "Open Nitfree" });
const dialog = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });

test.describe("chat bar button", () => {
  test.beforeEach(async ({ page }) => {
    await openDiscord(page);
  });

  test("comes first in the composer's button group, once, styled like Discord's buttons", async ({ page }) => {
    await expect(togglers(page)).toHaveCount(1);

    const first = page.locator("[class^=\"buttons_\"] > :first-child");

    await expect(first).toHaveAttribute("data-nitfree-toggler");
    await expect(first).toHaveClass(/buttonContainer__74017/);
    await expect(first).not.toHaveClass(/expression-picker-chat-input-button/);
    await expect(button(page)).toHaveClass(/button__74017 button__24af7/);
    await expect(button(page).locator("> div")).toHaveClass(/buttonWrapper__24af7/);
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");

    // Discord keeps changing the page; the button must not multiply.
    await page.evaluate(() => document.body.append(document.createElement("div")));
    await page.waitForTimeout(200);
    await expect(togglers(page)).toHaveCount(1);
  });

  test("comes back when Discord re-renders the composer, and joins a thread's composer", async ({ page }) => {
    await page.evaluate((html) => {
      const chat = document.getElementById("chat")!;

      chat.replaceChildren();
      chat.insertAdjacentHTML("beforeend", html);
    }, COMPOSER);
    await expect(togglers(page)).toHaveCount(1);

    await page.evaluate(() => document.querySelector("[data-nitfree-toggler]")?.remove());
    await expect(togglers(page)).toHaveCount(1);

    await page.evaluate(html => document.getElementById("thread")!.insertAdjacentHTML("beforeend", html), COMPOSER);
    await expect(togglers(page)).toHaveCount(2);
    await expect(page.locator("#thread [class^=\"buttons_\"] > :first-child")).toHaveAttribute("data-nitfree-toggler");
  });
});

test.describe("panel", () => {
  test.beforeEach(async ({ page }) => {
    await openDiscord(page);
  });

  test("opens above the button with placeholder content and closes on a second click", async ({ page }) => {
    await button(page).click();

    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("Your emojis, stickers and GIFs will show up here.");
    await expect(button(page)).toHaveAttribute("aria-expanded", "true");

    const panelBox = await dialog(page).boundingBox();
    const buttonBox = await button(page).boundingBox();
    const viewport = page.viewportSize()!;

    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(buttonBox!.y);
    expect(panelBox!.x).toBeGreaterThanOrEqual(0);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport.width);

    await button(page).click();
    await expect(dialog(page)).toBeHidden();
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("closes on Escape and gives focus back to the button", async ({ page }) => {
    await button(page).focus();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(button(page)).toBeFocused();
  });

  test("closes on a click outside, not on a click inside", async ({ page }) => {
    await button(page).click();
    await dialog(page).click();
    await expect(dialog(page)).toBeVisible();

    await page.mouse.click(10, 10);
    await expect(dialog(page)).toBeHidden();
  });

  test("closes when its composer goes away", async ({ page }) => {
    await button(page).click();
    await expect(dialog(page)).toBeVisible();

    await page.evaluate(() => document.getElementById("chat")!.replaceChildren());
    await expect(dialog(page)).toBeHidden();
  });
});

test.describe("in french", () => {
  test.use({ locale: "fr-FR" });

  test("labels the button and panel in french", async ({ page }) => {
    await openDiscord(page);
    await page.getByRole("button", { name: "Ouvrir Nitfree" }).click();
    await expect(page.getByRole("dialog", { name: "Bibliothèque Nitfree" })).toContainText("Vos emojis, stickers et GIF apparaîtront ici.");
  });
});
