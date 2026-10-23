import type { Page } from "@playwright/test";
import type { TEncodedBlob } from "./images";

import { Buffer } from "node:buffer";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, request } from "./helpers";
import { gif, png } from "./images";



type TListed = { id: string; title: string; type: string; width: number; height: number; animated: boolean; mime: string };

const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const tile = (page: Page, title: string) => panel(page).getByRole("region", { name: "All files" }).locator(`[data-tile][aria-label="${title}"]`);
const addFiles = (page: Page) => panel(page).getByRole("banner").getByRole("button", { name: "Add Files" });
const addDialog = (page: Page) => page.getByRole("dialog", { name: "Add to Nitfree" });
const editDialog = (page: Page) => page.getByRole("dialog", { name: "Edit item" });
const imageEditor = (page: Page) => page.getByRole("dialog", { name: "Edit image" });

function upload(name: string, blob: TEncodedBlob): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: blob.type, buffer: Buffer.from(blob.data, "base64") };
}

async function openPanel(page: Page): Promise<void> {
  await openDiscord(page);
  await page.getByRole("button", { name: "Open Nitfree" }).click();
  await expect(panel(page)).toBeVisible();
}

async function addFile(page: Page, file: ReturnType<typeof upload>): Promise<void> {
  const chooser = page.waitForEvent("filechooser");

  await addFiles(page).click();
  await (await chooser).setFiles([file]);
  await expect(addDialog(page)).toBeVisible();
}

/**
 * A PNG made in the page: a white square with a red one in its middle.
 *
 * @param page - Any page.
 * @returns The PNG.
 */
async function framedPng(page: Page): Promise<TEncodedBlob> {
  const data = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(20, 20);
    const context = canvas.getContext("2d")!;

    context.fillStyle = "#fff";
    context.fillRect(0, 0, 20, 20);
    context.fillStyle = "#f00";
    context.fillRect(5, 5, 10, 10);

    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());

    return btoa(String.fromCharCode(...bytes));
  });

  return { $nf: "blob", type: "image/png", data };
}

/**
 * Reads a library item's file in the page: its frame count and the alpha of two pixels.
 *
 * @param page - Any page.
 * @param popup - The popup, to ask the background.
 * @param id - The item.
 * @returns What was read.
 */
async function readItemFile(page: Page, popup: Page, id: string): Promise<{ frames: number; corner: number; middle: number }> {
  const file = (await request<TEncodedBlob>(popup, "library:file", { id })).data!;

  return page.evaluate(async ({ type, data }) => {
    const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
    const decoder = new ImageDecoder({ data: bytes, type });

    await decoder.tracks.ready;
    await decoder.completed;

    const frames = decoder.tracks.selectedTrack!.frameCount;
    const bitmap = await createImageBitmap(new Blob([bytes], { type }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;

    context.drawImage(bitmap, 0, 0);

    const alpha = (x: number, y: number): number => context.getImageData(x, y, 1, 1).data[3]!;

    return { frames, corner: alpha(0, 0), middle: alpha(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2)) };
  }, file);
}

test.describe("quick edits", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await openPopup(popup, extensionId);
  });

  const list = async (): Promise<TListed[]> => (await request<TListed[]>(popup, "library:list")).data!;

  test("cropping an image to square before adding it makes a square emoji, and can be reverted", async ({ page }) => {
    await openPanel(page);
    await addFile(page, upload("banner.png", png(80, 40)));

    const dialog = addDialog(page);

    await dialog.getByRole("button", { name: "Edit image" }).click();

    const editor = imageEditor(page);

    await expect(editor.locator("[data-size]")).toHaveText("80 × 40 · Emojis and stickers look best square.");
    await editor.getByRole("radio", { name: "Square" }).click();
    await expect(editor.locator("[data-size]")).toHaveText("40 × 40");
    await editor.getByRole("button", { name: "Apply" }).click();
    await expect(editor).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Edit image" })).toBeFocused();

    // Reverting gives the original back, and editing again starts from it.
    await dialog.getByRole("button", { name: "Revert to original" }).click();
    await expect(dialog.getByRole("button", { name: "Revert to original" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Edit image" }).click();
    await expect(editor.locator("[data-size]")).toContainText("80 × 40");
    await editor.getByRole("radio", { name: "Square" }).click();
    await editor.getByRole("button", { name: "Apply" }).click();
    await expect(editor).toHaveCount(0);

    // Opened again, it shows the edits made.
    await dialog.getByRole("button", { name: "Edit image" }).click();
    await expect(editor.locator("[data-size]")).toHaveText("40 × 40");
    await expect(editor.getByRole("radio", { name: "Square" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Add 1 file" }).click();
    await expect(tile(page, "banner")).toBeVisible();
    expect(await list()).toMatchObject([{ title: "banner", type: "emoji", width: 40, height: 40, mime: "image/png" }]);
  });

  test("the crop is drawn with the pointer and moved with the arrow keys", async ({ page }) => {
    await openPanel(page);
    await addFile(page, upload("wide.png", png(100, 50)));
    await addDialog(page).getByRole("button", { name: "Edit image" }).click();

    const editor = imageEditor(page);
    const area = editor.getByRole("button", { name: /Crop area/ });
    const box = (await area.boundingBox())!;
    const scale = box.width / 100;

    // From (10, 10) to (40, 30), in the image's pixels.
    await page.mouse.move(box.x + 10 * scale, box.y + 10 * scale);
    await page.mouse.down();
    await page.mouse.move(box.x + 40 * scale, box.y + 30 * scale, { steps: 4 });
    await page.mouse.up();
    await expect(editor.locator("[data-size]")).toContainText("30 × 20");

    // Dragged from inside, it moves and keeps its size.
    const crop = (await area.boundingBox())!;

    await page.mouse.move(crop.x + crop.width / 2, crop.y + crop.height / 2);
    await page.mouse.down();
    await page.mouse.move(crop.x + crop.width / 2 + 20 * scale, crop.y + crop.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(editor.locator("[data-size]")).toContainText("30 × 20");
    expect((await area.boundingBox())!.x).toBeGreaterThan(crop.x + 10 * scale);

    await area.focus();
    await page.keyboard.press("Shift+ArrowDown");
    await expect(editor.locator("[data-size]")).not.toContainText("30 × 20");
    await editor.getByRole("button", { name: "Show all" }).click();
    await expect(editor.locator("[data-size]")).toContainText("100 × 50");
  });

  test("removing the background clears the color around the subject", async ({ page }) => {
    await openPanel(page);
    await addFile(page, upload("framed.png", await framedPng(page)));
    await addDialog(page).getByRole("button", { name: "Edit image" }).click();

    const editor = imageEditor(page);

    await editor.getByRole("checkbox", { name: "Remove background" }).check();
    await editor.getByRole("button", { name: "Apply" }).click();
    await addDialog(page).getByRole("button", { name: "Add 1 file" }).click();
    await expect(tile(page, "framed")).toBeVisible();

    const [item] = await list();

    expect(await readItemFile(page, popup, item!.id)).toEqual({ frames: 1, corner: 0, middle: 255 });
  });

  test("trimming a GIF keeps the frames between the first and the last", async ({ page }) => {
    await openPanel(page);
    await addFile(page, upload("blink.gif", gif(8, 8, [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255]])));
    await addDialog(page).getByRole("button", { name: "Edit image" }).click();

    const editor = imageEditor(page);

    await expect(editor.locator("[data-frames]")).toContainText("Frames 1 to 4 of 4");
    await editor.getByRole("slider", { name: "First frame" }).fill("1");
    await editor.getByRole("slider", { name: "Last frame" }).fill("2");
    await expect(editor.locator("[data-frames]")).toContainText("Frames 2 to 3 of 4");
    await editor.getByRole("button", { name: "Apply" }).click();
    await addDialog(page).getByRole("button", { name: "Add 1 file" }).click();
    await expect(tile(page, "blink")).toBeVisible();

    const [item] = await list();

    expect(item).toMatchObject({ animated: true, mime: "image/gif" });
    expect((await readItemFile(page, popup, item!.id)).frames).toBe(2);
  });

  test("editing the image of a library item adds a new item and keeps the original", async ({ page }) => {
    await request(popup, "library:add", { file: png(60, 30), type: "sticker", title: "banner" });
    await openPanel(page);

    await tile(page, "banner").click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Edit" }).click();
    await editDialog(page).getByRole("button", { name: "Edit image" }).click();

    const editor = imageEditor(page);

    await editor.getByRole("radio", { name: "Square" }).click();
    await editor.getByRole("button", { name: "Apply" }).click();

    // The dialog now adds a copy; reverting goes back to editing the item.
    const dialog = addDialog(page);

    await expect(dialog.getByText("Saving adds the edited image as a new item. “banner” stays as it is.")).toBeVisible();
    await dialog.getByRole("button", { name: "Revert to original" }).click();
    await expect(editDialog(page)).toBeVisible();
    await editDialog(page).getByRole("button", { name: "Edit image" }).click();
    await editor.getByRole("radio", { name: "Square" }).click();
    await editor.getByRole("button", { name: "Apply" }).click();

    await dialog.getByRole("textbox", { name: "Name" }).fill("banner_square");
    await dialog.getByRole("button", { name: "Add 1 file" }).click();
    await expect(tile(page, "banner_square")).toBeVisible();

    const items = await list();

    expect(items.find(item => item.title === "banner")).toMatchObject({ type: "sticker", width: 60, height: 30 });
    expect(items.find(item => item.title === "banner_square")).toMatchObject({ type: "sticker", width: 30, height: 30 });
  });
});
