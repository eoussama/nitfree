import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, PICKER, PNG, request } from "./helpers";



const button = (page: Page) => page.getByRole("button", { name: "Open Nitfree" });
const nitfreeTab = (page: Page) => page.getByRole("tab", { name: "Nitfree" });
const nitfreePanel = (page: Page) => page.locator("#nitfree-picker-tab-panel");
const discordPanel = (page: Page) => page.locator("[role=\"tabpanel\"][data-discord-tab]");
const emojiTab = (page: Page) => page.locator("#emoji-picker-tab");
const gifTab = (page: Page) => page.locator("#gif-picker-tab");
const picker = (page: Page) => page.locator("[class*=\"expressionPickerPositionLayer\"]");

async function expectNitfreeShowing(page: Page): Promise<void> {
  await expect(nitfreeTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(nitfreeTab(page)).toHaveClass(/navButtonActive__08434/);
  await expect(emojiTab(page)).toHaveAttribute("aria-selected", "false");
  await expect(emojiTab(page)).not.toHaveClass(/navButtonActive__08434/);
  await expect(nitfreePanel(page)).toBeVisible();
  await expect(discordPanel(page)).toBeHidden();
  await expect(button(page)).toHaveAttribute("aria-expanded", "true");
}

async function expectDiscordShowing(page: Page, tab: "emoji" | "gif"): Promise<void> {
  await expect(page.locator(`#${tab}-picker-tab`)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#${tab}-picker-tab`)).toHaveClass(/navButtonActive__08434/);
  await expect(nitfreeTab(page)).toHaveAttribute("aria-selected", "false");
  await expect(nitfreeTab(page)).not.toHaveClass(/navButtonActive__08434/);
  await expect(nitfreePanel(page)).toBeHidden();
  await expect(discordPanel(page)).toBeVisible();
  await expect(button(page)).toHaveAttribute("aria-expanded", "false");
}

test.describe("Nitfree tab in Discord's picker", () => {
  test.beforeEach(async ({ page }) => {
    await openDiscord(page, { picker: true });
  });

  test("the chat bar button opens the picker on the Nitfree tab, after Discord's tabs", async ({ page }) => {
    await button(page).click();

    await expect(picker(page)).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(4);
    await expect(page.getByRole("tab").last()).toHaveText("Nitfree");
    await expect(nitfreeTab(page)).toHaveClass(/navButton__08434 navItem__08434/);
    await expectNitfreeShowing(page);
    await expect(nitfreePanel(page).getByRole("searchbox", { name: "Search Nitfree" })).toBeFocused();
    await expect(page.getByRole("dialog", { name: "Nitfree library" })).toHaveCount(0);

    const box = await nitfreePanel(page).boundingBox();

    expect(box?.height).toBe(426);
  });

  test("hands over to Discord's tabs, whether or not Discord re-renders", async ({ page }) => {
    await button(page).click();
    await expectNitfreeShowing(page);

    // Discord thinks Emoji is still showing, so clicking it changes nothing on Discord's side.
    await emojiTab(page).click();
    await expectDiscordShowing(page, "emoji");

    await nitfreeTab(page).click();
    await expectNitfreeShowing(page);

    await gifTab(page).click();
    await expectDiscordShowing(page, "gif");
  });

  test("can be chosen from the picker itself", async ({ page }) => {
    await page.getByRole("button", { name: "Add Emoji" }).click();
    await expect(nitfreeTab(page)).toBeVisible();

    await nitfreeTab(page).click();
    await expectNitfreeShowing(page);
  });

  test("works the same when the picker was opened from the GIF button", async ({ page }) => {
    await page.getByRole("button", { name: "Open GIF picker" }).click();
    await nitfreeTab(page).click();
    await expect(nitfreeTab(page)).toHaveAttribute("aria-selected", "true");
    await expect(gifTab(page)).not.toHaveClass(/navButtonActive__08434/);
    await expect(button(page)).toHaveAttribute("aria-expanded", "true");

    // The GIF button goes back to GIFs instead of closing the picker.
    await page.getByRole("button", { name: "Open GIF picker" }).click();
    await expect(picker(page)).toBeVisible();
    await expectDiscordShowing(page, "gif");

    // And the Nitfree button closes it, even though the GIF button opened it.
    await nitfreeTab(page).click();
    await button(page).hover();
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect(picker(page)).toHaveCount(0);
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("hands over to Discord's tabs from the keyboard", async ({ page }) => {
    await button(page).click();
    await expectNitfreeShowing(page);

    await gifTab(page).focus();
    await page.keyboard.press("Enter");
    await expectDiscordShowing(page, "gif");

    await nitfreeTab(page).focus();
    await page.keyboard.press("Enter");
    await expectNitfreeShowing(page);
  });

  test("Discord's emoji button goes back to Emoji instead of closing the picker", async ({ page }) => {
    await button(page).click();
    await expectNitfreeShowing(page);

    await page.getByRole("button", { name: "Add Emoji" }).click();
    await expect(picker(page)).toBeVisible();
    await expectDiscordShowing(page, "emoji");
  });

  test("closes with the chat bar button and with Escape", async ({ page }) => {
    await button(page).click();
    await expectNitfreeShowing(page);

    // A real click: Discord closes its picker on the press, frames pass, then the click lands.
    await button(page).hover();
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect(picker(page)).toHaveCount(0);
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");

    await button(page).click();
    await expectNitfreeShowing(page);

    await page.keyboard.press("Escape");
    await expect(picker(page)).toHaveCount(0);
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("closes with a long press on the chat bar button", async ({ page }) => {
    await button(page).click();
    await expectNitfreeShowing(page);

    await button(page).hover();
    await page.mouse.down();
    await page.waitForTimeout(2000);
    await page.mouse.up();
    await expect(picker(page)).toHaveCount(0);
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("stays selected when Discord re-renders the picker or its tabs", async ({ page }) => {
    await button(page).click();
    await expectNitfreeShowing(page);

    // React re-applies its classes to the tab it thinks is active.
    await page.evaluate(() => {
      const tab = document.getElementById("emoji-picker-tab")!;

      tab.classList.add("navButtonActive__08434");
      tab.setAttribute("aria-selected", "true");
    });
    await expectNitfreeShowing(page);

    // React replaces the whole picker.
    await page.evaluate((html) => {
      const layers = document.getElementById("layers")!;

      layers.replaceChildren();
      layers.insertAdjacentHTML("beforeend", html);
    }, PICKER);
    await expect(page.getByRole("tab")).toHaveCount(4);
    await expectNitfreeShowing(page);
  });

  test("shows the library", async ({ context, page, extensionId }) => {
    const popup = await context.newPage();

    await openPopup(popup, extensionId);
    await request(popup, "library:add", { file: PNG, type: "emoji", title: "wave" });

    await button(page).click();
    await expect(nitfreePanel(page).getByRole("region", { name: "All files" }).locator("[data-tile]")).toHaveAttribute("aria-label", "wave");
  });
});

test("falls back to the popover when Discord's picker does not open", async ({ page }) => {
  await openDiscord(page);
  await button(page).click();

  await expect(page.getByRole("dialog", { name: "Nitfree library" })).toBeVisible();
  await expect(button(page)).toHaveAttribute("aria-expanded", "true");
});

test("falls back to the popover, closing Discord's picker, when the picker has no tab bar", async ({ page }) => {
  await openDiscord(page, { picker: "no-tabs" });
  await button(page).click();

  await expect(page.getByRole("dialog", { name: "Nitfree library" })).toBeVisible();
  await expect(picker(page)).toHaveCount(0);
});
