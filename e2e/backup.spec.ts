import type { Page } from "@playwright/test";

import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, openPopupPage, request } from "./helpers";
import { png } from "./images";



type TStoredItem = { id: string; title: string; favorite: boolean; tags: string[] };

const backup = (page: Page) => page.getByRole("region", { name: "Backup" });
const library = (page: Page) => page.getByRole("region", { name: "Library" });
const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const tile = (page: Page, title: string) => panel(page).getByRole("region", { name: "All files" }).locator(`[data-tile][aria-label="${title}"]`);

async function items(page: Page): Promise<TStoredItem[]> {
  return (await request<TStoredItem[]>(page, "library:list")).data!;
}

async function seed(page: Page): Promise<void> {
  const tag = (await request<{ id: string }>(page, "tags:add", { name: "Cats" })).data!;

  await request(page, "library:add", { file: png(32, 32), type: "emoji", title: "wave", tags: [tag.id], favorite: true });
  await request(page, "library:add", { file: png(48, 48), type: "sticker", title: "loaf" });
  await expect(library(page).getByText("2 items")).toBeVisible();
  await openPopupPage(page, "Backup");
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

async function pickFile(page: Page, button: string, file: string | { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  const chooser = page.waitForEvent("filechooser");

  await backup(page).getByRole("button", { name: button }).click();
  await (await chooser).setFiles(file);
}

test.describe("backup", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await openPopup(popup, extensionId);
  });

  test("exports the library, and importing it into an empty library restores everything, once", async () => {
    await seed(popup);

    const before = await items(popup);
    const { name, file } = await downloaded(popup, () => backup(popup).getByRole("button", { name: "Export library" }).click());

    expect(name).toMatch(/^nitfree-\d{4}-\d{2}-\d{2}\.nitfree$/);
    await expect(backup(popup).getByRole("status")).toHaveText("Exported 2 items.");

    const zip = unzipSync(fs.readFileSync(file));

    expect(Object.keys(zip).sort()).toEqual(expect.arrayContaining(["library.json", "manifest.json"]));
    expect(Object.keys(zip).filter(entry => entry.startsWith("files/"))).toHaveLength(2);
    expect(zip["settings.json"]).toBeUndefined();

    // As in a fresh profile.
    await request(popup, "library:clear");
    expect(await items(popup)).toEqual([]);

    await pickFile(popup, "Import file", file);
    await expect(backup(popup).getByText("2 items, 1 tag,")).toBeVisible();
    await backup(popup).getByRole("button", { name: "Import", exact: true }).click();
    await expect(backup(popup).getByRole("status")).toHaveText("Added 2, skipped 0 already in your library.");

    const after = await items(popup);
    const tags = (await request<{ id: string; name: string }[]>(popup, "tags:list")).data!;

    expect(after.map(({ id, title, favorite }) => ({ id, title, favorite }))).toEqual(before.map(({ id, title, favorite }) => ({ id, title, favorite })));
    expect(tags.map(tag => tag.name)).toEqual(["Cats"]);
    expect(after.find(item => item.title === "wave")?.tags).toEqual([tags[0]!.id]);

    // The same backup again adds nothing.
    await pickFile(popup, "Import file", file);
    await backup(popup).getByRole("button", { name: "Import", exact: true }).click();
    await expect(backup(popup).getByRole("status")).toHaveText("Added 0, skipped 2 already in your library.");
    expect(await items(popup)).toHaveLength(2);
  });

  test("settings travel with a backup only when asked, and replacing empties the library first", async () => {
    await seed(popup);
    await backup(popup).getByRole("checkbox", { name: "Include settings" }).check();

    const { file } = await downloaded(popup, () => backup(popup).getByRole("button", { name: "Export library" }).click());

    expect(unzipSync(fs.readFileSync(file))["settings.json"]).toBeDefined();

    await request(popup, "library:add", { file: png(64, 64), type: "image", title: "extra" });
    expect(await items(popup)).toHaveLength(3);

    await pickFile(popup, "Import file", file);
    await expect(backup(popup).getByRole("checkbox", { name: "Also apply the settings in this file" })).toBeChecked();
    await backup(popup).getByRole("radio", { name: /Replace my library/ }).check();
    await backup(popup).getByRole("button", { name: "Import", exact: true }).click();
    await expect(backup(popup).getByRole("status")).toHaveText("Added 2, skipped 0 already in your library.");
    expect((await items(popup)).map(item => item.title).sort()).toEqual(["loaf", "wave"]);
  });

  test("a damaged file is refused with a clear message, and nothing is written", async () => {
    await openPopupPage(popup, "Backup");
    await pickFile(popup, "Import file", { name: "broken.nitfree", mimeType: "application/zip", buffer: Buffer.from("not a zip") });

    await expect(backup(popup).getByRole("alert")).toHaveText("This is not a zip file, or it is damaged.");
    await expect(backup(popup).getByRole("button", { name: "Import", exact: true })).toHaveCount(0);
    expect(await items(popup)).toEqual([]);
  });

  test("a folder of images is imported, its subfolders becoming tags", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nitfree-folder-"));
    const memes = path.join(root, "memes");
    const bytes = (data: { data: string }) => Buffer.from(data.data, "base64");

    fs.mkdirSync(memes);
    fs.writeFileSync(path.join(memes, "happy_cat.png"), bytes(png(16, 16)));
    fs.writeFileSync(path.join(root, "dog.png"), bytes(png(20, 20)));
    fs.writeFileSync(path.join(root, "notes.txt"), "hello");
    await openPopupPage(popup, "Backup");

    await pickFile(popup, "Import folder", root);
    await expect(backup(popup).getByText("2 items, 1 tag,")).toBeVisible();
    await expect(backup(popup).getByText("1 file that is not a supported image is left out.")).toBeVisible();
    await backup(popup).getByRole("button", { name: "Import", exact: true }).click();
    await expect(backup(popup).getByRole("status")).toHaveText("Added 2, skipped 0 already in your library.");

    const tags = (await request<{ id: string; name: string }[]>(popup, "tags:list")).data!;
    const imported = await items(popup);

    expect(tags.map(tag => tag.name)).toEqual(["memes"]);
    expect(imported.find(item => item.title === "happy cat")?.tags).toEqual([tags[0]!.id]);
    expect(imported.find(item => item.title === "dog")?.tags).toEqual([]);
  });

  test("a backup dropped on the popup's home is imported, on the backup page, rather than added", async () => {
    await seed(popup);

    const { file } = await downloaded(popup, () => backup(popup).getByRole("button", { name: "Export library" }).click());

    await popup.getByRole("button", { name: "Back" }).click();
    await expect(library(popup)).toBeVisible();

    await popup.locator("main").evaluate((main, data) => {
      const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
      const dataTransfer = new DataTransfer();

      dataTransfer.items.add(new File([bytes], "backup.nitfree"));
      main.dispatchEvent(new DragEvent("dragover", { dataTransfer, bubbles: true, cancelable: true }));
      main.dispatchEvent(new DragEvent("drop", { dataTransfer, bubbles: true, cancelable: true }));
    }, fs.readFileSync(file).toString("base64"));

    await expect(backup(popup).getByText("backup.nitfree")).toBeVisible();
    await expect(popup.getByRole("dialog", { name: "Add to Nitfree" })).toHaveCount(0);
  });

  test("the panel downloads one item's file, and exports the items it shows", async ({ context }) => {
    await seed(popup);

    const page = await context.newPage();

    await openDiscord(page);
    await page.getByRole("button", { name: "Open Nitfree" }).click();

    // From the right-click menu.
    await tile(page, "wave").click({ button: "right" });

    const single = await downloaded(page, () => page.getByRole("menuitem", { name: "Download" }).click());

    expect(single.name).toBe("wave.png");
    expect(fs.readFileSync(single.file).subarray(1, 4).toString()).toBe("PNG");

    // From the hover bar.
    await tile(page, "loaf").hover();

    const hovered = await downloaded(page, () => page.locator("[data-action-bar]").getByRole("button", { name: "Download" }).click());

    expect(hovered.name).toBe("loaf.png");

    // Searching narrows what is exported.
    await panel(page).getByRole("searchbox", { name: "Search Nitfree" }).fill("loaf");

    const shown = await downloaded(page, () => panel(page).getByRole("button", { name: "Export shown items" }).click());
    const library = JSON.parse(Buffer.from(unzipSync(fs.readFileSync(shown.file))["library.json"]!).toString()) as { items: { title: string }[]; tags: unknown[] };

    expect(shown.name).toMatch(/\.nitfree$/);
    expect(library.items.map(item => item.title)).toEqual(["loaf"]);
    expect(library.tags).toEqual([]);
    await expect(page.getByText("Exported 1 item.")).toBeVisible();
  });
});
