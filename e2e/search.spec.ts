import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, request } from "./helpers";
import { png } from "./images";



const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const allFiles = (page: Page) => panel(page).getByRole("region", { name: "All files" });
const search = (page: Page) => panel(page).getByRole("searchbox", { name: "Search Nitfree" });
const tray = (page: Page) => page.locator("[data-list-id=\"attachments\"] [data-list-item-id]");

/**
 * The titles of the tiles in All files, in order.
 *
 * @param page - The Discord page.
 * @returns The titles.
 */
async function shown(page: Page): Promise<string[]> {
  return allFiles(page).locator("[data-tile]").evaluateAll(tiles => tiles.map(element => element.getAttribute("aria-label") ?? ""));
}

/**
 * The names of the files in each message the stand-in Discord received.
 *
 * @param page - The Discord page.
 * @returns One list of names per sent message.
 */
async function sent(page: Page): Promise<string[][]> {
  return page.evaluate(() => (globalThis as unknown as { discordSent: Array<{ files: File[] }> }).discordSent.map(message => message.files.map(file => file.name)));
}

async function openPanel(page: Page): Promise<void> {
  await openDiscord(page);
  await page.getByRole("button", { name: "Open Nitfree" }).click();
  await expect(panel(page)).toBeVisible();
}

test.describe("search", () => {
  test.beforeEach(async ({ context, extensionId }) => {
    const popup = await context.newPage();

    await openPopup(popup, extensionId);

    const tag = async (name: string) => (await request<{ id: string }>(popup, "tags:add", { name })).data!.id;
    const [happyCat, dog] = [await tag("Happy Cat"), await tag("dog")];
    const add = (title: string, description: string, tags: string[]) => request(popup, "library:add", { file: png(64, 64), type: "emoji", title, description, tags });

    await add("tabby", "Purring on the sofa", [happyCat!]);
    await add("grumpy", "", [happyCat!]);
    await add("pug", "Snoring", [dog!]);
    await add("Café", "", []);
    await add("plain", "crème brûlée", []);
  });

  test("typing part of a tag name lists every item with that tag", async ({ page }) => {
    await openPanel(page);

    await search(page).fill("cat");
    await expect.poll(async () => (await shown(page)).sort()).toEqual(["grumpy", "tabby"]);

    // Case does not matter, nor does where in the name the part is.
    await search(page).fill("HAPP");
    await expect.poll(async () => (await shown(page)).sort()).toEqual(["grumpy", "tabby"]);
  });

  test("looks in descriptions too", async ({ page }) => {
    await openPanel(page);

    await search(page).fill("snor");
    await expect.poll(() => shown(page)).toEqual(["pug"]);
  });

  test("ignores accents, in what is typed and in what is stored", async ({ page }) => {
    await openPanel(page);

    await search(page).fill("cafe");
    await expect.poll(() => shown(page)).toEqual(["Café"]);

    await search(page).fill("CAFÉ");
    await expect.poll(() => shown(page)).toEqual(["Café"]);

    await search(page).fill("creme brulee");
    await expect.poll(() => shown(page)).toEqual(["plain"]);
  });

  test("needs every word to match, wherever it is found", async ({ page }) => {
    await openPanel(page);

    await search(page).fill("tabby sofa cat");
    await expect.poll(() => shown(page)).toEqual(["tabby"]);

    await search(page).fill("grumpy dog");
    await expect(panel(page)).toContainText("Nothing matches “grumpy dog”.");
    await expect(panel(page).locator("[data-tile]")).toHaveCount(0);
  });

  test("Enter sends the first result and closes the panel", async ({ page }) => {
    await openPanel(page);

    await search(page).fill("cat");
    await expect.poll(() => shown(page)).toHaveLength(2);

    const [first] = await shown(page);

    await search(page).press("Enter");

    await expect(panel(page)).toHaveCount(0);
    await expect.poll(() => sent(page)).toEqual([[`${first}.png`]]);
  });

  test("Shift+Enter adds the first result to the message without sending", async ({ page }) => {
    await openPanel(page);

    await search(page).fill("pug");
    await expect.poll(() => shown(page)).toEqual(["pug"]);
    await search(page).press("Shift+Enter");

    await expect(tray(page)).toHaveText(["pug.png"]);
    await expect(panel(page)).toBeVisible();
    expect(await sent(page)).toEqual([]);
  });

  test("Enter does nothing with nothing typed, or nothing found", async ({ page }) => {
    await openPanel(page);

    await search(page).press("Enter");
    await search(page).fill("zzz");
    await search(page).press("Enter");

    await expect(panel(page)).toBeVisible();
    await expect(tray(page)).toHaveCount(0);
    expect(await sent(page)).toEqual([]);
  });

  test("Down moves into the results, and Enter there sends the one focused", async ({ page }) => {
    await openPanel(page);

    await search(page).fill("cat");
    await expect.poll(() => shown(page)).toHaveLength(2);

    const second = (await shown(page))[1];

    await search(page).press("ArrowDown");
    await expect(allFiles(page).locator("[data-tile]").first()).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(allFiles(page).locator("[data-tile]").nth(1)).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(panel(page)).toHaveCount(0);
    await expect.poll(() => sent(page)).toEqual([[`${second}.png`]]);
  });
});
