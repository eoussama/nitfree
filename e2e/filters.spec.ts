import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, request } from "./helpers";
import { png } from "./images";



const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const allFiles = (page: Page) => panel(page).getByRole("region", { name: "All files" });
const tile = (page: Page, title: string) => allFiles(page).locator(`[data-tile][aria-label="${title}"]`);
const filterButton = (page: Page) => panel(page).getByRole("button", { name: "Filter by type, pack or tag" });
const menu = (page: Page) => page.getByRole("dialog", { name: "Filter by type, pack or tag" });
const chips = (page: Page) => panel(page).getByRole("list", { name: "Active filters" });
const search = (page: Page) => panel(page).getByRole("searchbox", { name: "Search Nitfree" });
const pickerPanel = (page: Page) => page.locator("#nitfree-picker-tab-panel");

/**
 * The titles of the tiles in All files, in order.
 *
 * @param page - The Discord page.
 * @returns The titles.
 */
async function shown(page: Page): Promise<string[]> {
  return allFiles(page).locator("[data-tile]").evaluateAll(tiles => tiles.map(element => element.getAttribute("aria-label") ?? ""));
}

async function openPanel(page: Page): Promise<void> {
  await openDiscord(page);
  await page.getByRole("button", { name: "Open Nitfree" }).click();
  await expect(panel(page)).toBeVisible();
}

test.describe("filtering", () => {
  let popup: Page;
  let ids: Record<string, string>;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await openPopup(popup, extensionId);

    ids = {};

    for (const name of ["cat", "dog", "happy", "unused"]) {
      ids[name] = (await request<{ id: string }>(popup, "tags:add", { name })).data!.id;
    }

    const add = (title: string, type: string, tags: string[]) => request(popup, "library:add", { file: png(64, 64), type, title, tags: tags.map(tag => ids[tag]) });

    await add("tabby", "emoji", ["cat", "happy"]);
    await add("grumpy", "gif", ["cat"]);
    await add("pug", "sticker", ["dog", "happy"]);
    await add("logo", "image", []);
  });

  test("the menu offers the types and the tags that items carry, with how many", async ({ page }) => {
    await openPanel(page);
    await expect(filterButton(page)).toBeEnabled();
    await expect(filterButton(page)).toHaveAttribute("aria-expanded", "false");

    await filterButton(page).click();
    await expect(menu(page)).toBeVisible();
    await expect(filterButton(page)).toHaveAttribute("aria-expanded", "true");

    await expect(menu(page).getByRole("button")).toHaveText(["Emoji 1", "Sticker 1", "GIF 1", "Image 1"]);
    await expect(menu(page).getByRole("checkbox")).toHaveCount(3);
    await expect(menu(page).getByRole("checkbox", { name: "cat" })).toHaveAccessibleName("cat 2");
    await expect(menu(page).getByRole("checkbox", { name: "dog" })).toHaveAccessibleName("dog 1");
    await expect(menu(page).getByRole("checkbox", { name: "happy" })).toHaveAccessibleName("happy 2");
    await expect(menu(page).getByRole("checkbox", { name: "unused" })).toHaveCount(0);
  });

  test("two tags show only the items carrying both", async ({ page }) => {
    await openPanel(page);
    expect((await shown(page)).sort()).toEqual(["grumpy", "logo", "pug", "tabby"]);

    await filterButton(page).click();
    await menu(page).getByRole("checkbox", { name: "cat" }).check();
    await expect.poll(async () => (await shown(page)).sort()).toEqual(["grumpy", "tabby"]);

    await menu(page).getByRole("checkbox", { name: "happy" }).check();
    await expect.poll(() => shown(page)).toEqual(["tabby"]);

    // Each filter is a chip, and the button says how many are in force.
    await expect(chips(page).getByRole("listitem")).toHaveText(["cat", "happy", "Clear filters"]);
    await expect(filterButton(page).locator(".badge")).toHaveText("2");

    // Taking one off widens the result again. The menu hides the chips while open.
    await page.keyboard.press("Escape");
    await chips(page).getByRole("button", { name: "Remove filter happy" }).click();
    await expect.poll(async () => (await shown(page)).sort()).toEqual(["grumpy", "tabby"]);

    await filterButton(page).click();
    await expect(menu(page).getByRole("checkbox", { name: "happy" })).not.toBeChecked();
  });

  test("types are alternatives, and combine with tags and the search", async ({ page }) => {
    await openPanel(page);
    await filterButton(page).click();

    await menu(page).getByRole("button", { name: "GIF" }).click();
    await expect.poll(() => shown(page)).toEqual(["grumpy"]);

    await menu(page).getByRole("button", { name: "Emoji" }).click();
    await expect.poll(async () => (await shown(page)).sort()).toEqual(["grumpy", "tabby"]);
    await expect(menu(page).getByRole("button", { name: "GIF" })).toHaveAttribute("aria-pressed", "true");

    await menu(page).getByRole("checkbox", { name: "happy" }).check();
    await expect.poll(() => shown(page)).toEqual(["tabby"]);

    // The search narrows the filtered items further.
    await menu(page).getByRole("checkbox", { name: "happy" }).uncheck();
    await search(page).fill("grum");
    await expect.poll(() => shown(page)).toEqual(["grumpy"]);
    await search(page).fill("pug");
    await expect(panel(page).getByText("Nothing matches “pug” with these filters.")).toBeVisible();
  });

  test("Escape, a click elsewhere or the button close the menu, and the panel stays", async ({ page }) => {
    await openPanel(page);

    await filterButton(page).click();
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    await expect(filterButton(page)).toBeFocused();

    await filterButton(page).click();
    await panel(page).locator(".body").click({ position: { x: 300, y: 250 } });
    await expect(menu(page)).toHaveCount(0);

    await filterButton(page).click();
    await expect(menu(page)).toBeVisible();
    await filterButton(page).click();
    await expect(menu(page)).toHaveCount(0);

    await filterButton(page).click();
    await search(page).click();
    await expect(menu(page)).toHaveCount(0);
  });

  test("works from the keyboard, and removing a chip moves focus to the next one", async ({ page }) => {
    await openPanel(page);

    await filterButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByRole("button", { name: "Emoji" })).toBeFocused();

    // Past the four types, onto the first tag.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(menu(page).getByRole("checkbox", { name: "cat" })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(menu(page).getByRole("checkbox", { name: "cat" })).toBeChecked();

    await page.keyboard.press("ArrowDown");
    await expect(menu(page).getByRole("checkbox", { name: "dog" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect(chips(page).getByRole("listitem")).toHaveText(["cat", "happy", "Clear filters"]);

    await page.keyboard.press("Escape");
    await expect(filterButton(page)).toBeFocused();

    await chips(page).getByRole("button", { name: "Remove filter cat" }).focus();
    await page.keyboard.press("Enter");
    await expect(chips(page).getByRole("button", { name: "Remove filter happy" })).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(chips(page)).toHaveCount(0);
    await expect(filterButton(page)).toBeFocused();
  });

  test("tabbing out of the menu closes it", async ({ page }) => {
    await openPanel(page);

    await filterButton(page).click();
    await menu(page).getByRole("checkbox", { name: "happy" }).focus();
    await page.keyboard.press("Tab");
    await expect(menu(page)).toHaveCount(0);
  });

  test("a filter nothing passes says so, and clearing it brings everything back", async ({ page }) => {
    await openPanel(page);
    await filterButton(page).click();
    await menu(page).getByRole("checkbox", { name: "cat" }).check();
    await menu(page).getByRole("checkbox", { name: "dog" }).check();

    await expect(panel(page).getByText("Nothing matches these filters.")).toBeVisible();
    await expect(panel(page).locator("[data-tile]")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await panel(page).locator(".body").getByRole("button", { name: "Clear filters" }).click();
    await expect.poll(async () => (await shown(page)).sort()).toEqual(["grumpy", "logo", "pug", "tabby"]);
    await expect(chips(page)).toHaveCount(0);
    await expect(search(page)).toBeFocused();
  });

  test("the menu's own Clear filters clears the choices and keeps the menu", async ({ page }) => {
    await openPanel(page);
    await filterButton(page).click();
    await menu(page).getByRole("button", { name: "GIF" }).click();
    await menu(page).getByRole("checkbox", { name: "cat" }).check();

    await menu(page).getByRole("button", { name: "Clear filters" }).click();

    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByRole("button", { name: "GIF" })).toHaveAttribute("aria-pressed", "false");
    await expect(menu(page).getByRole("checkbox", { name: "cat" })).not.toBeChecked();
    await expect(menu(page).getByRole("button", { name: "Emoji" })).toBeFocused();
    await expect.poll(async () => (await shown(page)).length).toBe(4);
  });

  test("filtering shows what a collapsed section hides", async ({ page }) => {
    await openPanel(page);

    await panel(page).getByRole("button", { name: "All files", expanded: true }).click();
    await expect(tile(page, "tabby")).toHaveCount(0);

    await filterButton(page).click();
    await menu(page).getByRole("checkbox", { name: "cat" }).check();
    await expect(tile(page, "tabby")).toBeVisible();

    await page.keyboard.press("Escape");
    await chips(page).getByRole("button", { name: "Clear filters" }).click();
    await expect(tile(page, "tabby")).toHaveCount(0);
  });

  test("a tag deleted elsewhere stops being a filter", async ({ page }) => {
    await openPanel(page);
    await filterButton(page).click();
    await menu(page).getByRole("checkbox", { name: "cat" }).check();
    await expect.poll(async () => (await shown(page)).length).toBe(2);

    await request(popup, "tags:remove", { id: ids.cat });

    await expect(chips(page)).toHaveCount(0);
    await expect.poll(async () => (await shown(page)).length).toBe(4);
  });

  test("many tags can be searched by name in the menu", async ({ page }) => {
    for (let i = 0; i < 8; i++) {
      const id = (await request<{ id: string }>(popup, "tags:add", { name: `extra_${i}` })).data!.id;

      await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: `extra_${i}`, tags: [id] });
    }

    await openPanel(page);
    await filterButton(page).click();

    const find = menu(page).getByRole("searchbox", { name: "Find a tag" });

    await expect(find).toBeVisible();
    await expect(menu(page).getByRole("checkbox")).toHaveCount(11);

    await find.fill("extra_3");
    await expect(menu(page).getByRole("checkbox")).toHaveCount(1);

    await find.fill("zzz");
    await expect(menu(page).getByText("No tag matches “zzz”.")).toBeVisible();
  });

  test("in a library without tags, the menu says how to get some", async ({ context, page, extensionId }) => {
    const fresh = await context.newPage();

    await openPopup(fresh, extensionId);
    for (const tag of (await request<{ id: string }[]>(fresh, "tags:list")).data!) {
      await request(fresh, "tags:remove", { id: tag.id });
    }

    await openPanel(page);
    await filterButton(page).click();
    await expect(menu(page).getByText("Tag your items to filter by them.")).toBeVisible();
    await expect(menu(page).getByRole("searchbox")).toHaveCount(0);
  });
});

test.describe("filtering in Discord's picker", () => {
  test("Escape closes the menu and leaves the picker open", async ({ context, page, extensionId }) => {
    const popup = await context.newPage();

    await openPopup(popup, extensionId);

    const cat = (await request<{ id: string }>(popup, "tags:add", { name: "cat" })).data!.id;

    await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: "tabby", tags: [cat] });
    await popup.close();
    await openDiscord(page, { picker: true });
    await page.getByRole("button", { name: "Open Nitfree" }).click();

    const button = pickerPanel(page).getByRole("button", { name: "Filter by type, pack or tag" });

    await button.click();
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(pickerPanel(page)).toBeVisible();
    await expect(button).toBeFocused();

    // The menu sits inside the picker, not clipped by it.
    await button.click();

    const inside = (await pickerPanel(page).boundingBox())!;
    const box = (await menu(page).boundingBox())!;

    expect(box.x).toBeGreaterThanOrEqual(inside.x);
    expect(box.x + box.width).toBeLessThanOrEqual(inside.x + inside.width);
    expect(box.y + box.height).toBeLessThanOrEqual(inside.y + inside.height);

    // A click on the panel elsewhere closes it, the picker's focus lock notwithstanding.
    await pickerPanel(page).getByRole("searchbox", { name: "Search Nitfree" }).click();
    await expect(menu(page)).toHaveCount(0);
  });
});
