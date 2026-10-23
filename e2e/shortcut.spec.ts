import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, openPopupPage } from "./helpers";



const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const search = (page: Page) => panel(page).getByRole("searchbox", { name: "Search Nitfree" });
const toggler = (page: Page) => page.getByRole("button", { name: "Open Nitfree" });
const messageBox = (page: Page) => page.getByRole("textbox").first();
const tooltip = (page: Page) => page.getByRole("tooltip");

test.describe("keyboard shortcut", () => {
  test("Ctrl+Alt+N in a channel opens the panel ready to search, and closes it again", async ({ page }) => {
    await openDiscord(page);
    await messageBox(page).click();

    await page.keyboard.press("Control+Alt+N");
    await expect(panel(page)).toBeVisible();
    await expect(search(page)).toBeFocused();
    await page.keyboard.type("cat");
    await expect(search(page)).toHaveValue("cat");

    await page.keyboard.press("Control+Alt+N");
    await expect(panel(page)).toHaveCount(0);

    // Also with nothing focused.
    await page.locator("body").click({ position: { x: 4, y: 4 } });
    await page.keyboard.press("Control+Alt+N");
    await expect(panel(page)).toBeVisible();
  });

  test("in Discord's picker when it can host the panel, on the Nitfree tab", async ({ page }) => {
    await openDiscord(page, { picker: true });
    await messageBox(page).click();

    await page.keyboard.press("Control+Alt+N");
    await expect(page.getByRole("tab", { name: "Nitfree" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#nitfree-picker-tab-panel").getByRole("searchbox", { name: "Search Nitfree" })).toBeFocused();
  });

  test("the Nitfree button's tooltip names it", async ({ page }) => {
    await openDiscord(page);

    await expect(toggler(page)).toHaveAttribute("aria-keyshortcuts", "Control+Alt+N");
    await toggler(page).hover();
    await expect(tooltip(page)).toContainText("Open Nitfree");
    await expect(tooltip(page).locator("kbd")).toHaveText(["Ctrl", "Alt", "N"]);
  });

  test("can be changed or turned off in the popup", async ({ context, extensionId, page }) => {
    const popup = await context.newPage();

    await openPopup(popup, extensionId);
    await openPopupPage(popup, "Settings");

    const keys = popup.locator("[data-shortcut] kbd");

    await expect(keys).toHaveText(["Ctrl", "Alt", "N"]);

    // Shift alone is refused, as it types capitals; Escape stops recording and keeps the shortcut.
    await popup.getByRole("button", { name: "Change" }).click();
    await expect(popup.getByText("Press the keys…")).toBeVisible();
    await popup.keyboard.press("Shift+K");
    await expect(popup.getByRole("alert")).toHaveText("Hold Ctrl or Alt with the key.");
    await popup.keyboard.press("Escape");
    await expect(keys).toHaveText(["Ctrl", "Alt", "N"]);

    await popup.getByRole("button", { name: "Change" }).click();
    await popup.keyboard.press("Control+Shift+K");
    await expect(keys).toHaveText(["Ctrl", "Shift", "K"]);
    await expect(popup.getByRole("button", { name: "Reset" })).toBeVisible();

    await openDiscord(page);
    await expect(toggler(page)).toHaveAttribute("aria-keyshortcuts", "Control+Shift+K");
    await messageBox(page).click();
    await page.keyboard.press("Control+Alt+N");
    // Longer than Nitfree waits for Discord's picker before showing its own popover.
    await page.waitForTimeout(800);
    await expect(panel(page)).toHaveCount(0);
    await page.keyboard.press("Control+Shift+K");
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);

    await popup.bringToFront();
    await popup.getByRole("switch", { name: "Open Nitfree with a shortcut" }).uncheck();
    await expect(popup.getByRole("button", { name: "Change" })).toBeDisabled();

    await page.bringToFront();
    await expect(toggler(page)).not.toHaveAttribute("aria-keyshortcuts");
    await messageBox(page).click();
    await page.keyboard.press("Control+Shift+K");
    await page.waitForTimeout(800);
    await expect(panel(page)).toHaveCount(0);

    await popup.bringToFront();
    await popup.getByRole("switch", { name: "Open Nitfree with a shortcut" }).check();
    await popup.getByRole("button", { name: "Reset" }).click();
    await expect(keys).toHaveText(["Ctrl", "Alt", "N"]);
  });
});
