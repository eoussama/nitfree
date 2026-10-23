import type { Page } from "@playwright/test";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, openPopupPage, request } from "./helpers";
import { png } from "./images";



type TStoredItem = { id: string; title: string; packs: string[] };
type TPack = { id: string; name: string; icon: string | null };

const packsPage = (page: Page) => page.getByRole("region", { name: "Packs" });
const backup = (page: Page) => page.getByRole("region", { name: "Backup" });
const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const allFiles = (page: Page) => panel(page).getByRole("region", { name: "All files" });
const tile = (page: Page, title: string) => allFiles(page).locator(`[data-tile][aria-label="${title}"]`);
const filterButton = (page: Page) => panel(page).getByRole("button", { name: "Filter by type, pack or tag" });
const filterMenu = (page: Page) => page.getByRole("dialog", { name: "Filter by type, pack or tag" });
const chips = (page: Page) => panel(page).getByRole("list", { name: "Active filters" });
const editDialog = (page: Page) => page.getByRole("dialog", { name: "Edit item" });

async function items(page: Page): Promise<TStoredItem[]> {
  return (await request<TStoredItem[]>(page, "library:list")).data!;
}

async function packs(page: Page): Promise<TPack[]> {
  return (await request<TPack[]>(page, "packs:list")).data!;
}

async function addPack(page: Page, name: string): Promise<TPack> {
  return (await request<TPack>(page, "packs:add", { name })).data!;
}

async function addItem(page: Page, title: string, size: number, inPacks: TPack[] = []): Promise<TStoredItem> {
  return (await request<TStoredItem>(page, "library:add", { file: png(size, size), type: "emoji", title, packs: inPacks.map(pack => pack.id) })).data!;
}

/**
 * The titles of the tiles in All files, sorted.
 *
 * @param page - The Discord page.
 * @returns The titles.
 */
async function shown(page: Page): Promise<string[]> {
  const titles = await allFiles(page).locator("[data-tile]").evaluateAll(tiles => tiles.map(element => element.getAttribute("aria-label") ?? ""));

  return titles.sort();
}

/**
 * Clicks a button that starts a download and saves the file.
 *
 * @param page - The page.
 * @param click - Starts the download.
 * @returns The saved file's name and path.
 */
async function downloaded(page: Page, click: () => Promise<void>): Promise<{ name: string; file: string }> {
  const download = page.waitForEvent("download");

  await click();

  const done = await download;
  const file = path.join(os.tmpdir(), `nitfree-e2e-${Date.now()}-${done.suggestedFilename()}`);

  await done.saveAs(file);

  return { name: done.suggestedFilename(), file };
}

test.describe("packs", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await openPopup(popup, extensionId);
  });

  test("the popup makes, renames and deletes packs, and their items stay in the library", async () => {
    await openPopupPage(popup, "Packs");
    await expect(packsPage(popup).getByRole("status")).toHaveText("No packs yet.");

    const create = packsPage(popup).getByRole("button", { name: "Create pack" });

    await expect(create).toBeDisabled();
    await packsPage(popup).getByRole("textbox", { name: "Name" }).fill("  Cats ");
    await create.click();
    await expect(packsPage(popup).getByRole("status").filter({ hasText: "Created" })).toHaveText("Created “Cats”.");
    await expect(packsPage(popup).getByRole("textbox", { name: "Name" })).toHaveValue("");
    await expect(packsPage(popup).getByRole("radio", { name: "Cats 0 items" })).toBeChecked();

    // Names are unique whatever their case.
    await packsPage(popup).getByRole("textbox", { name: "Name" }).fill("cats");
    await create.click();
    await expect(packsPage(popup).getByRole("alert")).toContainText("already exists");
    expect(await packs(popup)).toHaveLength(1);

    // An item put in the pack elsewhere counts at once.
    const [cats] = await packs(popup);

    await addItem(popup, "loaf", 32, [cats!]);
    await expect(packsPage(popup).getByRole("radio", { name: "Cats 1 item" })).toBeVisible();

    await packsPage(popup).getByRole("button", { name: "Rename" }).click();

    const renamed = packsPage(popup).getByRole("textbox", { name: "Name" }).last();

    await expect(renamed).toBeFocused();
    await expect(renamed).toHaveValue("Cats");
    await renamed.fill("Kittens");
    await packsPage(popup).getByRole("button", { name: "Save" }).click();
    await expect(packsPage(popup).getByRole("status")).toHaveText("Renamed to “Kittens”.");
    await expect(packsPage(popup).getByRole("radio", { name: "Kittens 1 item" })).toBeChecked();

    await packsPage(popup).getByRole("button", { name: "Delete" }).click();

    const confirm = popup.getByRole("dialog", { name: "Delete “Kittens”" });

    await expect(confirm).toContainText("The pack is deleted, and its items stay in your library.");
    await confirm.getByRole("button", { name: "Delete pack" }).click();
    await expect(packsPage(popup).getByText("Deleted “Kittens”.")).toBeVisible();
    await expect(packsPage(popup).getByText("No packs yet.")).toBeVisible();
    expect(await packs(popup)).toEqual([]);
    expect((await items(popup)).map(({ title, packs: inPacks }) => ({ title, packs: inPacks }))).toEqual([{ title: "loaf", packs: [] }]);
  });

  test("items join and leave packs from their edit dialog, and the panel filters by pack", async ({ page }) => {
    const cats = await addPack(popup, "Cats");
    const dogs = await addPack(popup, "Dogs");

    await addItem(popup, "tabby", 32, [cats]);
    await addItem(popup, "pug", 40, [dogs]);
    await addItem(popup, "logo", 48);

    await openDiscord(page);
    await page.getByRole("button", { name: "Open Nitfree" }).click();
    await expect(panel(page)).toBeVisible();

    await tile(page, "logo").click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Edit" }).click();

    // Packs are picked like tags: typing suggests the ones that match, and a new name makes a pack.
    const field = editDialog(page).getByRole("combobox", { name: "Packs" });

    await field.pressSequentially("ca");
    await expect(editDialog(page).getByRole("option")).toHaveText(["Cats"]);
    await field.press("ArrowDown");
    await field.press("Enter");
    await expect(editDialog(page).getByRole("button", { name: "Remove Cats" })).toBeVisible();
    await field.pressSequentially("Party,");
    await expect(editDialog(page).getByRole("button", { name: "Remove Party" })).toBeVisible();
    await editDialog(page).getByRole("button", { name: "Save" }).click();
    await expect(editDialog(page)).toHaveCount(0);

    const party = (await packs(popup)).find(pack => pack.name === "Party");

    expect(party).toBeDefined();
    await expect.poll(async () => (await items(popup)).find(item => item.title === "logo")?.packs).toEqual([cats.id, party!.id]);

    // Packs are alternatives: either one shows its items.
    await filterButton(page).click();

    const cat = filterMenu(page).getByRole("button", { name: "Cats 2" });

    await expect(filterMenu(page).getByRole("button", { name: "Dogs 1" })).toBeVisible();
    await cat.click();
    await expect(cat).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => shown(page)).toEqual(["logo", "tabby"]);
    await filterMenu(page).getByRole("button", { name: "Dogs 1" }).click();
    await expect.poll(() => shown(page)).toEqual(["logo", "pug", "tabby"]);
    await page.keyboard.press("Escape");
    await expect(chips(page).getByRole("listitem").filter({ hasText: "Cats" })).toBeVisible();

    await chips(page).getByRole("button", { name: "Remove filter Dogs" }).click();
    await expect.poll(() => shown(page)).toEqual(["logo", "tabby"]);

    // Leaving the pack takes the item out of the filtered panel.
    await tile(page, "logo").click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Edit" }).click();
    await editDialog(page).getByRole("button", { name: "Remove Cats" }).click();
    await editDialog(page).getByRole("button", { name: "Save" }).click();
    await expect(editDialog(page)).toHaveCount(0);
    await expect.poll(() => shown(page)).toEqual(["tabby"]);

    // A pack deleted elsewhere stops being a filter.
    await request(popup, "packs:remove", { id: cats.id });
    await expect(chips(page)).toHaveCount(0);
    await expect.poll(() => shown(page)).toEqual(["logo", "pug", "tabby"]);
  });

  test("each pack is a section of the panel before All files, in the sidebar by its icon, and searching its name finds its items", async ({ page }) => {
    const cats = await addPack(popup, "Cats");

    await addItem(popup, "tabby", 32, [cats]);
    await addItem(popup, "loaf", 40, [cats]);
    await addItem(popup, "logo", 48);

    await openDiscord(page);
    await page.getByRole("button", { name: "Open Nitfree" }).click();
    await expect(panel(page)).toBeVisible();

    const sidebar = panel(page).getByRole("navigation", { name: "Sections" });
    const section = panel(page).getByRole("region", { name: "Cats" });
    const titles = (region: typeof section) => region.locator("[data-tile]").evaluateAll(tiles => tiles.map(element => element.getAttribute("aria-label")));
    const picture = (title: string) => tile(page, title).locator("img").getAttribute("src");

    await expect(panel(page).locator(".section-label")).toHaveText(["Cats", "All files"]);
    await expect(sidebar.getByRole("button")).toHaveCount(2);
    await expect(sidebar.getByRole("button").first()).toHaveAccessibleName("Cats");
    await expect(sidebar.getByRole("button").last()).toHaveAccessibleName("All files");
    expect(await titles(section)).toEqual(["loaf", "tabby"]);

    // The pack shows as its newest item until another is picked.
    const icon = sidebar.getByRole("button", { name: "Cats" }).locator("img");

    await expect(icon).toHaveAttribute("src", /^blob:/);
    await expect.poll(async () => (await icon.getAttribute("src")) === (await picture("loaf"))).toBe(true);

    await openPopupPage(popup, "Packs");
    await expect(packsPage(popup).getByRole("radio", { name: "loaf" })).toBeChecked();
    await packsPage(popup).getByRole("radio", { name: "tabby" }).check();
    await expect.poll(async () => (await packs(popup))[0]?.icon).toBe((await items(popup)).find(item => item.title === "tabby")?.id);
    await expect.poll(async () => (await icon.getAttribute("src")) === (await picture("tabby"))).toBe(true);

    // The pack's name finds what is in it, in its section and in All files.
    await panel(page).getByRole("searchbox", { name: "Search Nitfree" }).fill("cats");
    await expect.poll(() => shown(page)).toEqual(["loaf", "tabby"]);
    expect(await titles(section)).toEqual(["loaf", "tabby"]);

    // Jumping to the pack from the sidebar highlights it.
    await panel(page).getByRole("searchbox", { name: "Search Nitfree" }).fill("");
    await sidebar.getByRole("button", { name: "Cats" }).click();
    await expect(sidebar.getByRole("button", { name: "Cats" })).toHaveClass(/active/);

    // A pack left empty has no section.
    await request(popup, "library:update", { id: (await items(popup)).find(item => item.title === "tabby")!.id, patch: { packs: [] } });
    await request(popup, "library:update", { id: (await items(popup)).find(item => item.title === "loaf")!.id, patch: { packs: [] } });
    await expect(panel(page).locator(".section-label")).toHaveText(["All files"]);
  });

  test("a pack exported on one browser imports with the same items and name on another", async () => {
    const cats = await addPack(popup, "Cats");
    const dogs = await addPack(popup, "Dogs");

    await addItem(popup, "tabby", 32, [cats, dogs]);
    await addItem(popup, "loaf", 40, [cats]);
    await addItem(popup, "pug", 48, [dogs]);
    await openPopupPage(popup, "Packs");

    // The first pack is picked until another is.
    await expect(packsPage(popup).getByRole("radio", { name: "Cats 2 items" })).toBeChecked();

    const { name, file } = await downloaded(popup, () => packsPage(popup).getByRole("button", { name: "Export" }).click());

    expect(name).toBe("Cats.nitfree");
    await expect(packsPage(popup).getByRole("status")).toHaveText("Exported 2 items.");

    // Only the pack and its items, each in that pack alone.
    const library = JSON.parse(strFromU8(unzipSync(fs.readFileSync(file))["library.json"]!)) as { items: { title: string; packs: string[] }[]; packs: TPack[] };

    expect(library.packs.map(pack => pack.name)).toEqual(["Cats"]);
    expect(library.items.map(item => item.title).sort()).toEqual(["loaf", "tabby"]);
    expect(library.items.every(item => item.packs.length === 1 && item.packs[0] === library.packs[0]!.id)).toBe(true);

    // As in another browser's profile.
    await request(popup, "library:clear");
    expect(await packs(popup)).toEqual([]);

    await popup.getByRole("button", { name: "Back" }).click();
    await openPopupPage(popup, "Backup");

    const chooser = popup.waitForEvent("filechooser");

    await backup(popup).getByRole("button", { name: "Import file" }).click();
    await (await chooser).setFiles(file);
    await expect(backup(popup).getByText("Packs: Cats")).toBeVisible();
    await backup(popup).getByRole("button", { name: "Import", exact: true }).click();
    await expect(backup(popup).getByRole("status")).toHaveText("Added 2, skipped 0 already in your library.");

    const [imported] = await packs(popup);

    expect(imported?.name).toBe("Cats");
    expect((await items(popup)).map(({ title, packs: inPacks }) => ({ title, packs: inPacks })).sort((a, b) => a.title.localeCompare(b.title))).toEqual([
      { title: "loaf", packs: [imported!.id] },
      { title: "tabby", packs: [imported!.id] },
    ]);

    await popup.getByRole("button", { name: "Back" }).click();
    await openPopupPage(popup, "Packs");
    await expect(packsPage(popup).getByRole("radio", { name: "Cats 2 items" })).toBeChecked();
  });
});
