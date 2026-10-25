import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, openPopupPage } from "./helpers";



const diagnostics = (page: Page) => page.getByRole("region", { name: "Diagnostics" });
const check = (page: Page, id: string) => diagnostics(page).locator(`dd[data-check="${id}"]`);
const summary = (page: Page) => diagnostics(page).getByRole("status").first();

/**
 * Opens the diagnostics page from the settings, which runs the checks.
 *
 * @param popup - The popup page.
 * @returns Resolves once the page shows.
 */
async function openDiagnostics(popup: Page): Promise<void> {
  await openPopupPage(popup, "Settings");
  await popup.getByRole("button", { name: "Run diagnostics" }).click();
  await expect(diagnostics(popup)).toBeVisible();
}

/**
 * What Nitfree's toolbar button shows for the Discord tab.
 *
 * @param popup - The popup page.
 * @returns The badge's text.
 */
async function badge(popup: Page): Promise<string> {
  return popup.evaluate(async () => {
    type TChrome = {
      tabs: { query: (info: object) => Promise<{ id: number }[]> };
      action: { getBadgeText: (details: object) => Promise<string> };
    };
    const { chrome } = globalThis as unknown as { chrome: TChrome };
    const [tab] = await chrome.tabs.query({ url: "*://discord.com/*" });

    return chrome.action.getBadgeText({ tabId: tab!.id });
  });
}

test.describe("diagnostics", () => {
  let popup: Page;

  test.beforeEach(async ({ context }) => {
    popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
  });

  test("checks the open Discord tab, then its picker and menus, and copies a report", async ({ extensionId, page }) => {
    await openDiscord(page, { picker: true, messages: true });
    await openPopup(popup, extensionId);
    await openDiagnostics(popup);

    await expect(summary(popup)).toHaveText("Everything works.");

    for (const id of ["background", "library", "content", "composer", "chatButtonGroup", "toggler", "theme", "chatEmoji", "chatSticker", "chatImage"]) {
      await expect(check(popup, id)).toHaveText("Works");
    }

    for (const id of ["pickerTabList", "pickerTab", "contextMenu", "saveMenuItem"]) {
      await expect(check(popup, id)).toHaveText("Not checked");
    }

    await diagnostics(popup).getByRole("button", { name: "Check again" }).click();

    for (const id of ["pickerTabList", "pickerTabLook", "pickerTab", "contextMenu", "menuLook", "saveMenuItem"]) {
      await expect(check(popup, id)).toHaveText("Works");
    }

    await expect(summary(popup)).toHaveText("Everything works.");
    // Both were closed again.
    await expect(page.locator("[class*=\"expressionPickerPositionLayer\"]")).toHaveCount(0);
    await expect(page.getByRole("menu")).toHaveCount(0);

    // Extension pages cannot be granted reading the clipboard, so what is written to it is kept instead.
    await popup.evaluate(() => {
      navigator.clipboard.writeText = async (text) => {
        (globalThis as unknown as { copied: string }).copied = text;
      };
    });
    await diagnostics(popup).getByRole("button", { name: "Copy report" }).click();
    await expect(diagnostics(popup).getByText("Copied. Paste it into a bug report on GitHub.")).toBeVisible();

    const report = await popup.evaluate(() => (globalThis as unknown as { copied: string }).copied);

    expect(report).toMatch(/^Nitfree \d+\.\d+\.\d+\n.+\n\d{4}-\d\d-\d\dT.+Z\nDiscord tab: found\n/);
    expect(report).toContain("\n[composer]\ncomposer: ok\n");
    expect(report).toContain("\nsaveMenuItem: ok");
  });

  test("tells what Discord changed and what broke, and warns on the toolbar button", async ({ extensionId, page }) => {
    await openDiscord(page);
    await openPopup(popup, extensionId);
    await expect.poll(() => badge(popup), { timeout: 10_000 }).toBe("");

    // Discord drops a class: Nitfree still finds what it needs, from its fallbacks.
    await page.evaluate(() => {
      const composer = document.querySelector("[class*=\"channelTextArea_\"]")!;

      composer.className = [...composer.classList].filter(name => !name.startsWith("channelTextArea_")).join(" ");
    });
    await openDiagnostics(popup);

    await expect(summary(popup)).toHaveText("Everything works, but Discord changed 2 things Nitfree relies on.");
    await expect(check(popup, "composerBox")).toHaveText("Changed");
    await expect(check(popup, "chatButtonGroup")).toHaveText("Changed");
    await expect(check(popup, "toggler")).toHaveText("Works");

    // Discord renames its chat bar: Nitfree cannot find it any more.
    await page.evaluate(() => {
      const buttons = document.querySelector("[class^=\"buttons_\"]")!;

      buttons.className = "toolbar__0000";
    });
    await diagnostics(popup).getByRole("button", { name: "Check again" }).click();

    await expect(summary(popup)).toHaveText("1 thing is not working.");
    await expect(check(popup, "chatButtonGroup")).toHaveText("Not found");
    await expect(check(popup, "toggler")).toHaveText("Not checked");
    await expect.poll(() => badge(popup), { timeout: 10_000 }).toBe("!");

    // Discord puts it back, re-rendering the channel as it does.
    await page.evaluate(() => {
      document.querySelector(".toolbar__0000")!.className = "buttons__74017";
      document.body.append(document.createElement("div"));
    });
    await expect.poll(() => badge(popup), { timeout: 10_000 }).toBe("");
  });

  test("asks for a Discord tab when none is open, and goes back to the settings", async ({ extensionId }) => {
    await openPopup(popup, extensionId);
    await openDiagnostics(popup);

    await expect(summary(popup)).toHaveText("Open Discord in a tab, then run the checks again.");
    await expect(check(popup, "background")).toHaveText("Works");
    await expect(check(popup, "library")).toHaveText("Works");
    await expect(check(popup, "content")).toHaveText("Not checked");
    await diagnostics(popup).getByRole("button", { name: "Check again" }).click();
    await expect(summary(popup)).toHaveText("Open Discord in a tab, then run the checks again.");

    await popup.getByRole("button", { name: "Back" }).click();
    await expect(popup.getByRole("region", { name: "Settings" })).toBeVisible();
    await expect(popup.getByRole("button", { name: "Run diagnostics" })).toBeFocused();

    await popup.getByRole("button", { name: "Back" }).click();
    await expect(popup.getByRole("navigation").getByRole("button", { name: "Settings" })).toBeFocused();
    await expect(popup.getByRole("navigation").getByRole("button", { name: "Diagnostics" })).toHaveCount(0);
  });
});
