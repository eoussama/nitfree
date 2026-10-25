import type { Page } from "@playwright/test";

import { canSetLanguage, expect, test } from "./fixtures";
import { COMPOSER, openDiscord } from "./helpers";



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

    // As big as the glyphs of Discord's own buttons, not their whole 24 px box.
    const logo = await button(page).locator("span.logo").boundingBox();

    expect([logo?.width, logo?.height]).toEqual([20, 20]);

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
  test.skip(!canSetLanguage, "The browser's language cannot be set on macOS.");

  test("labels the button and panel in french", async ({ page }) => {
    await openDiscord(page);
    await page.getByRole("button", { name: "Ouvrir Nitfree" }).click();
    await expect(page.getByRole("dialog", { name: "Bibliothèque Nitfree" })).toContainText("Vos emojis, stickers et GIF apparaîtront ici.");
  });
});
