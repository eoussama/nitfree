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

    await expect(section(page, "Favorites").getByRole("button")).toHaveText(["wave"]);
    await expect(section(page, "Recent").getByRole("button")).toHaveText(["party"]);
    await expect(section(page, "All files").getByRole("button")).toHaveText(["cat", "party", "wave"]);
    await expect(section(page, "All files").locator("img").first()).toHaveAttribute("src", /^blob:/);
  });

  test("filters as you type and says when nothing matches", async ({ page }) => {
    await openPanel(page);

    await expect(search(page)).toBeFocused();
    await page.keyboard.type("PAR");
    await expect(section(page, "All files").getByRole("button")).toHaveText(["party"]);
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
    await expect(section(page, "All files").getByRole("button").last()).toBeFocused();

    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowUp");
    await expect(search(page)).toBeFocused();
  });

  test("updates live when the library changes elsewhere", async ({ context, page, extensionId }) => {
    await openPanel(page);
    await expect(section(page, "All files").getByRole("button")).toHaveCount(3);

    const popup = await context.newPage();

    await openPopup(popup, extensionId);
    await seed(popup, [{ title: "new" }]);

    await expect(section(page, "All files").getByRole("button")).toHaveCount(4);
    await expect(section(page, "All files").getByRole("button").first()).toHaveText("new");
  });
});

test("an empty library shows the empty state", async ({ page }) => {
  await openPanel(page);

  await expect(dialog(page)).toContainText("Your emojis, stickers and GIFs will show up here.");
});
