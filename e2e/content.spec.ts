import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, PNG, request } from "./helpers";



type TSeed = { title: string; favorite?: boolean; used?: boolean };

/**
 * Fills the library from an extension page, as the popup would.
 *
 * @param page - An extension page.
 * @param seeds - The items to add.
 * @returns Resolves once every item is stored.
 */
async function seed(page: Page, seeds: TSeed[]): Promise<void> {
  for (const { title, favorite, used } of seeds) {
    const { data } = await request<{ id: string }>(page, "library:add", { file: PNG, type: "emoji", title, favorite });

    if (used) {
      await request(page, "library:use", { id: data!.id });
    }
  }
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const section = (page: Page, name: string) => dialog(page).getByRole("region", { name });
const search = (page: Page) => dialog(page).getByRole("searchbox", { name: "Search Nitfree" });
const tiles = (page: Page, name: string) => section(page, name).locator("[data-tile]");
const titles = (page: Page, name: string) => tiles(page, name).evaluateAll(cells => cells.map(cell => cell.getAttribute("aria-label")));

async function openPanel(page: Page): Promise<void> {
  await openDiscord(page);
  await page.getByRole("button", { name: "Open Nitfree" }).click();
  await expect(dialog(page)).toBeVisible();
}

test.describe("panel content", () => {
  test.beforeEach(async ({ context, extensionId }) => {
    const popup = await context.newPage();

    await openPopup(popup, extensionId);
    await seed(popup, [
      { title: "wave", favorite: true },
      { title: "party", used: true },
      { title: "cat" },
    ]);
    await popup.close();
  });

  test("shows Favorites, Recent and All files, with thumbnails", async ({ page }) => {
    await openPanel(page);

    await expect.poll(() => titles(page, "Favorites")).toEqual(["wave"]);
    await expect.poll(() => titles(page, "Recent")).toEqual(["party"]);
    await expect.poll(() => titles(page, "All files")).toEqual(["cat", "party", "wave"]);
    await expect(section(page, "All files").locator("img").first()).toHaveAttribute("src", /^blob:/);
  });

  test("filters as you type and says when nothing matches", async ({ page }) => {
    await openPanel(page);

    await expect(search(page)).toBeFocused();
    await page.keyboard.type("PAR");
    await expect.poll(() => titles(page, "All files")).toEqual(["party"]);
    await expect(section(page, "Favorites")).toBeHidden();

    await search(page).fill("zzz");
    await expect(dialog(page)).toContainText("Nothing matches “zzz”.");
  });

  test("moves through tiles with the keyboard and back to the search field", async ({ page }) => {
    await openPanel(page);

    await page.keyboard.press("ArrowDown");
    await expect(section(page, "Favorites").getByRole("button", { name: "wave" })).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(section(page, "Recent").getByRole("button", { name: "party" })).toBeFocused();

    await page.keyboard.press("End");
    await expect(tiles(page, "All files").last()).toBeFocused();

    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowUp");
    await expect(search(page)).toBeFocused();
  });

  test("updates live when the library changes elsewhere", async ({ context, page, extensionId }) => {
    await openPanel(page);
    await expect(tiles(page, "All files")).toHaveCount(3);

    const popup = await context.newPage();

    await openPopup(popup, extensionId);
    await seed(popup, [{ title: "new" }]);

    await expect(tiles(page, "All files")).toHaveCount(4);
    await expect(tiles(page, "All files").first()).toHaveAttribute("aria-label", "new");
  });

  test("names the hovered or focused item in the inspector bar", async ({ page }) => {
    await openPanel(page);

    const inspector = dialog(page).getByRole("contentinfo");

    // All files lists the newest first: cat.
    await tiles(page, "All files").first().hover();
    await expect(inspector).toContainText(":cat:");
    await expect(inspector).toContainText("Emoji");

    await search(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(inspector).toContainText(":wave:");
  });

  test("collapses a section and jumps to one from the sidebar", async ({ page }) => {
    await openPanel(page);

    const toggle = section(page, "Favorites").getByRole("button", { name: "Favorites", exact: true }).first();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(tiles(page, "Favorites")).toHaveCount(0);

    await dialog(page).getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Favorites" }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(tiles(page, "Favorites")).toHaveCount(1);
  });
});

test("an empty library shows the empty state", async ({ page }) => {
  await openPanel(page);

  await expect(dialog(page)).toContainText("Your emojis, stickers and GIFs will show up here.");
});
