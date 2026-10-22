import type { Page } from "@playwright/test";

import { Buffer } from "node:buffer";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, PNG, request } from "./helpers";



type TListed = { id: string; title: string; type: string; description: string; favorite: boolean; tags: string[] };

const IMAGE = { name: "Party Parrot.png", mimeType: "image/png", buffer: Buffer.from(PNG.data, "base64") };
const TEXT = { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") };

const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const tile = (page: Page, title: string) => panel(page).getByRole("region", { name: "All files" }).locator(`[data-tile][aria-label="${title}"]`);
// The header's button; an empty library also offers one in its middle.
const addFiles = (page: Page) => panel(page).getByRole("banner").getByRole("button", { name: "Add Files" });
const addDialog = (page: Page) => page.getByRole("dialog", { name: "Add to Nitfree" });
const editDialog = (page: Page) => page.getByRole("dialog", { name: "Edit item" });
const menu = (page: Page) => page.getByRole("menu");
const toast = (page: Page) => page.getByRole("status").filter({ hasText: "Deleted" });

/**
 * Pastes a PNG where the browser would: on the focused element, inside shadow roots.
 *
 * @param page - The Discord page.
 * @param name - The pasted file's name.
 * @returns Resolves once the paste is dispatched.
 */
async function pasteImage(page: Page, name: string): Promise<void> {
  await page.evaluate(({ data, name }) => {
    let target: Element | null = document.activeElement;

    while (target?.shadowRoot?.activeElement) {
      target = target.shadowRoot.activeElement;
    }

    const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
    const clipboardData = new DataTransfer();

    clipboardData.items.add(new File([bytes], name, { type: "image/png" }));
    (target ?? document.body).dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, composed: true, cancelable: true }));
  }, { data: PNG.data, name });
}

const chatPastes = (page: Page) => page.evaluate(() => (globalThis as unknown as { discordChatPastes?: string[][] }).discordChatPastes ?? []);

async function openPanel(page: Page): Promise<void> {
  await openDiscord(page);
  await page.getByRole("button", { name: "Open Nitfree" }).click();
  await expect(panel(page)).toBeVisible();
}

async function list(popup: Page): Promise<TListed[]> {
  return (await request<TListed[]>(popup, "library:list")).data!;
}

async function tagNames(popup: Page, ids: string[]): Promise<string[]> {
  const tags = (await request<{ id: string; name: string }[]>(popup, "tags:list")).data!;

  return ids.map(id => tags.find(tag => tag.id === id)?.name ?? id).sort();
}

test.describe("adding, editing and deleting", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await openPopup(popup, extensionId);
  });

  test("Add Files opens the dialog, which saves the picked images with their details", async ({ page }) => {
    await openPanel(page);

    const chooser = page.waitForEvent("filechooser");

    await addFiles(page).click();
    await (await chooser).setFiles([IMAGE, TEXT]);

    const dialog = addDialog(page);

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveText("This file is not a supported image.");
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Party_Parrot");
    await expect(dialog.getByRole("textbox", { name: "Name" })).toBeFocused();
    await expect(dialog.getByRole("radio", { name: "Emoji" })).toHaveAttribute("aria-checked", "true");

    await dialog.getByRole("textbox", { name: "Name" }).fill("parrot");
    await dialog.getByRole("radio", { name: "Sticker" }).click();
    await dialog.getByRole("combobox", { name: "Tags" }).pressSequentially("birds, party,");
    await expect(dialog.getByRole("button", { name: "Remove birds" })).toBeVisible();
    await dialog.getByRole("textbox", { name: "Description" }).fill("a dancing parrot");
    await dialog.getByRole("button", { name: "Add 1 file" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(tile(page, "parrot")).toBeVisible();

    const [item] = await list(popup);

    expect(item).toMatchObject({ title: "parrot", type: "sticker", description: "a dancing parrot" });
    expect(await tagNames(popup, item!.tags)).toEqual(["birds", "party"]);
  });

  test("Cancel and Escape close the dialog without saving, and leave the panel open", async ({ page }) => {
    await openPanel(page);

    const chooser = page.waitForEvent("filechooser");

    await addFiles(page).click();
    await (await chooser).setFiles([IMAGE]);
    await expect(addDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(addDialog(page)).toHaveCount(0);
    await expect(panel(page)).toBeVisible();

    const again = page.waitForEvent("filechooser");

    await addFiles(page).click();
    await (await again).setFiles([IMAGE]);
    await addDialog(page).getByRole("button", { name: "Cancel" }).last().click();
    await expect(addDialog(page)).toHaveCount(0);
    expect(await list(popup)).toEqual([]);
  });

  test("dropped and pasted images open the add dialog, and never reach Discord's upload", async ({ page }) => {
    await openPanel(page);
    await page.evaluate(() => {
      const seen: string[] = [];

      Object.assign(globalThis, { discordSaw: seen });

      for (const type of ["drop", "paste"]) {
        document.addEventListener(type, () => seen.push(type));
      }
    });

    const transfer = async (): Promise<unknown> => page.evaluateHandle((data) => {
      const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
      const transfer = new DataTransfer();

      transfer.items.add(new File([bytes], "dropped.png", { type: "image/png" }));

      return transfer;
    }, PNG.data);

    const library = panel(page).locator(".library");

    await library.dispatchEvent("dragenter", { dataTransfer: await transfer() });
    await expect(panel(page).getByText("Drop to add to Nitfree")).toBeVisible();
    await library.dispatchEvent("drop", { dataTransfer: await transfer() });
    await expect(panel(page).getByText("Drop to add to Nitfree")).toHaveCount(0);
    await expect(addDialog(page).getByRole("textbox", { name: "Name" })).toHaveValue("dropped");
    await addDialog(page).getByRole("button", { name: "Add 1 file" }).click();
    await expect(tile(page, "dropped")).toBeVisible();

    await library.evaluate((element, data) => {
      const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
      const clipboardData = new DataTransfer();

      clipboardData.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, composed: true }));
    }, PNG.data);
    await expect(addDialog(page).getByRole("textbox", { name: "Name" })).toHaveValue("pasted");

    // Files dropped or pasted on the open dialog join it.
    await addDialog(page).dispatchEvent("drop", { dataTransfer: await transfer() });
    await expect(addDialog(page).getByRole("button", { name: "Add 2 files" })).toBeVisible();
    await addDialog(page).getByRole("textbox", { name: "Description" }).first().evaluate((element, data) => {
      const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
      const clipboardData = new DataTransfer();

      clipboardData.items.add(new File([bytes], "again.png", { type: "image/png" }));
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, composed: true, cancelable: true }));
    }, PNG.data);
    await expect(addDialog(page).getByRole("button", { name: "Add 3 files" })).toBeVisible();
    expect(await page.evaluate(() => (globalThis as unknown as { discordSaw: string[] }).discordSaw)).toEqual([]);
  });

  test("the item menu favorites and edits an item", async ({ page }) => {
    await request(popup, "library:add", { file: PNG, type: "emoji", title: "wave" });
    await openPanel(page);

    await tile(page, "wave").click({ button: "right" });
    await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
    await menu(page).getByRole("menuitem", { name: "Add to Favorites" }).click();
    await expect(menu(page)).toHaveCount(0);
    await expect(panel(page).getByRole("region", { name: "Favorites" }).locator("[data-tile]")).toHaveAttribute("aria-label", "wave");

    // Keyboard: the menu key on a focused tile, then arrows.
    await tile(page, "wave").focus();
    await page.keyboard.press("Shift+F10");
    await expect(menu(page).getByRole("menuitem", { name: "Remove from Favorites" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu(page).getByRole("menuitem", { name: "Details" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu(page).getByRole("menuitem", { name: "Edit" })).toBeFocused();
    await page.keyboard.press("Enter");

    const dialog = editDialog(page);

    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("wave");
    await dialog.getByRole("textbox", { name: "Name" }).fill("hello");
    await dialog.getByRole("radio", { name: "GIF" }).click();
    await dialog.getByRole("combobox", { name: "Tags" }).fill("greetings");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(tile(page, "hello")).toBeFocused();

    const [item] = await list(popup);

    expect(item).toMatchObject({ title: "hello", type: "gif", favorite: true });
    expect(await tagNames(popup, item!.tags)).toEqual(["greetings"]);
  });

  test("Escape closes the menu, not the panel", async ({ page }) => {
    await request(popup, "library:add", { file: PNG, type: "emoji", title: "wave" });
    await openPanel(page);

    await tile(page, "wave").click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    await expect(tile(page, "wave")).toBeFocused();
  });

  test("deleting hides the item at once, can be undone, and is final after the delay", async ({ page }) => {
    await request(popup, "library:add", { file: PNG, type: "emoji", title: "wave" });
    await request(popup, "library:add", { file: PNG, type: "emoji", title: "cat" });
    await openPanel(page);

    await tile(page, "wave").click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "Delete" }).click();
    await expect(tile(page, "wave")).toHaveCount(0);
    await expect(tile(page, "cat")).toBeFocused();
    await expect(toast(page)).toHaveText(/Deleted “wave”/);
    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect(tile(page, "wave")).toBeVisible();
    await expect(toast(page)).toHaveCount(0);

    // The Delete key removes the focused tile and moves focus to the next one.
    await tile(page, "cat").focus();
    await page.keyboard.press("Delete");
    await expect(tile(page, "cat")).toHaveCount(0);
    await expect(tile(page, "wave")).toBeFocused();
    await expect.poll(async () => (await list(popup)).map(item => item.title), { timeout: 10_000 }).toEqual(["wave"]);
    await expect(toast(page)).toHaveCount(0);
  });

  test("a pending deletion is made final when the page goes away", async ({ page }) => {
    await request(popup, "library:add", { file: PNG, type: "emoji", title: "wave" });
    await openPanel(page);

    await tile(page, "wave").focus();
    await page.keyboard.press("Delete");
    await expect(toast(page)).toBeVisible();
    await page.goto("about:blank");

    await expect.poll(async () => list(popup)).toEqual([]);
  });

  test("Escape closes the tag suggestions before the dialog", async ({ page }) => {
    await request(popup, "tags:add", { name: "birds" });
    await openPanel(page);

    const chooser = page.waitForEvent("filechooser");

    await addFiles(page).click();
    await (await chooser).setFiles([IMAGE]);

    const tags = addDialog(page).getByRole("combobox", { name: "Tags" });

    await tags.pressSequentially("bi");
    await expect(addDialog(page).getByRole("option", { name: "birds" })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(tags).toHaveAttribute("aria-activedescendant", /-0$/);
    await page.keyboard.press("Escape");
    await expect(addDialog(page).getByRole("listbox")).toHaveCount(0);
    await expect(addDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(addDialog(page)).toHaveCount(0);
    await expect(addFiles(page)).toBeFocused();
  });

  test("deleting the last item leaves focus in the panel and shows the empty state", async ({ page }) => {
    await request(popup, "library:add", { file: PNG, type: "emoji", title: "wave" });
    await openPanel(page);

    await tile(page, "wave").focus();
    await page.keyboard.press("Delete");
    await expect(panel(page).getByRole("searchbox", { name: "Search Nitfree" })).toBeFocused();
    await expect(panel(page).getByText("Your emojis, stickers and GIFs will show up here.")).toBeVisible();
    await toast(page).getByRole("button", { name: "Undo" }).click();

    await tile(page, "wave").focus();
    await page.keyboard.press("Shift+F10");
    await menu(page).getByRole("menuitem", { name: "Delete" }).click();
    await expect(panel(page).getByRole("searchbox", { name: "Search Nitfree" })).toBeFocused();
  });

  test("the menu key opens the item menu, which keeps the browser's own menu away", async ({ page }) => {
    await request(popup, "library:add", { file: PNG, type: "emoji", title: "wave", favorite: true });
    await openPanel(page);

    const favorite = panel(page).getByRole("region", { name: "Favorites" }).locator("[data-tile]");

    await favorite.focus();
    await page.keyboard.press("ContextMenu");

    const item = menu(page).getByRole("menuitem", { name: "Remove from Favorites" });

    await expect(item).toBeFocused();

    const prevented = await item.evaluate((element) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, composed: true, cancelable: true });

      element.dispatchEvent(event);

      return event.defaultPrevented;
    });

    expect(prevented).toBe(true);

    // Leaving Favorites takes the tile away, so focus follows the item to All files.
    await page.keyboard.press("Enter");
    await expect(tile(page, "wave")).toBeFocused();
    await expect(favorite).toHaveCount(0);
  });

  test("removing a tag with its button keeps focus in the tags field", async ({ page }) => {
    await openPanel(page);

    const chooser = page.waitForEvent("filechooser");

    await addFiles(page).click();
    await (await chooser).setFiles([IMAGE]);

    const tags = addDialog(page).getByRole("combobox", { name: "Tags" });

    await tags.pressSequentially("birds,cats,");
    await addDialog(page).getByRole("button", { name: "Remove birds" }).click();
    await expect(addDialog(page).getByRole("button", { name: "Remove birds" })).toHaveCount(0);
    await expect(tags).toBeFocused();
  });

  test("a paste after clicking anywhere in the panel adds the image, not Discord's chat box", async ({ page }) => {
    await request(popup, "library:add", { file: PNG, type: "emoji", title: "wave" });
    await openPanel(page);

    // An empty spot below the tiles.
    await panel(page).locator(".body").click({ position: { x: 200, y: 200 } });
    await pasteImage(page, "clicked.png");
    await expect(addDialog(page).getByRole("textbox", { name: "Name" })).toHaveValue("clicked");
    expect(await chatPastes(page)).toEqual([]);
  });

  test("keys typed in the dialog do not reach Discord", async ({ page }) => {
    await openPanel(page);
    await page.evaluate(() => {
      Object.assign(globalThis, { discordKeys: 0 });
      document.addEventListener("keydown", () => {
        (globalThis as unknown as { discordKeys: number }).discordKeys++;
      });
    });

    const chooser = page.waitForEvent("filechooser");

    await addFiles(page).click();
    await (await chooser).setFiles([IMAGE]);
    await addDialog(page).getByRole("textbox", { name: "Name" }).pressSequentially("abc");

    expect(await page.evaluate(() => (globalThis as unknown as { discordKeys: number }).discordKeys)).toBe(0);
  });
});

test.describe("in Discord's picker", () => {
  const tab = (page: Page) => page.locator("#nitfree-picker-tab-panel");
  const pickerTile = (page: Page, title: string) => tab(page).getByRole("region", { name: "All files" }).locator(`[data-tile][aria-label="${title}"]`);

  test.beforeEach(async ({ context, extensionId, page }) => {
    const popup = await context.newPage();

    await openPopup(popup, extensionId);
    await request(popup, "library:add", { file: PNG, type: "emoji", title: "wave" });
    await popup.close();
    await openDiscord(page, { picker: true });
    await page.getByRole("button", { name: "Open Nitfree" }).click();
    await expect(pickerTile(page, "wave")).toBeVisible();
  });

  test("Escape closes the menu and the dialog, and leaves the picker open", async ({ page }) => {
    await pickerTile(page, "wave").click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(tab(page)).toBeVisible();

    await pickerTile(page, "wave").click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "Edit" }).click();
    await expect(editDialog(page)).toBeVisible();
    await editDialog(page).getByRole("textbox", { name: "Name" }).fill("hi");
    await page.keyboard.press("Escape");
    await expect(editDialog(page)).toHaveCount(0);
    await expect(tab(page)).toBeVisible();
    await expect(pickerTile(page, "wave")).toBeFocused();
  });

  test("a paste after clicking anywhere in the tab adds the image, not Discord's chat box", async ({ page }) => {
    await tab(page).locator(".body").click({ position: { x: 200, y: 200 } });
    await pasteImage(page, "clicked.png");
    await expect(addDialog(page).getByRole("textbox", { name: "Name" })).toHaveValue("clicked");
    expect(await chatPastes(page)).toEqual([]);
  });

  test("the dialog's fields can be typed in while the picker holds focus, and saving updates the tab", async ({ page }) => {
    await pickerTile(page, "wave").click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "Edit" }).click();

    // Discord's picker pulls focus that leaves it back in; the dialog must keep it.
    const description = editDialog(page).getByRole("textbox", { name: "Description" });

    await description.click();
    await description.pressSequentially("waving hand");
    await expect(description).toBeFocused();
    await expect(description).toHaveValue("waving hand");
    await editDialog(page).getByRole("textbox", { name: "Name" }).fill("hello");
    await editDialog(page).getByRole("radio", { name: "Sticker" }).click();
    await editDialog(page).getByRole("button", { name: "Save" }).click();
    await expect(editDialog(page)).toHaveCount(0);
    await expect(tab(page)).toBeVisible();
    await expect(pickerTile(page, "hello")).toBeVisible();
  });
});
