import type { Page } from "@playwright/test";
import type { TEncodedBlob } from "./images";

import { Buffer } from "node:buffer";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, request } from "./helpers";



type TListed = { id: string; title: string; type: string; width: number; height: number; animated: boolean; mime: string; size: number };

const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const tile = (page: Page, title: string) => panel(page).getByRole("region", { name: "All files" }).locator(`[data-tile][aria-label="${title}"]`);
const addDialog = (page: Page) => page.getByRole("dialog", { name: "Add to Nitfree" });
const videoEditor = (page: Page) => page.getByRole("dialog", { name: "Video to GIF" });

/**
 * Records a WebM video in the page, 640 × 360, its color changing as it plays. Like any video a
 * browser records, it does not say how long it is.
 *
 * @param page - Any page.
 * @param seconds - How long to record.
 * @returns The video.
 */
async function recordVideo(page: Page, seconds: number): Promise<TEncodedBlob> {
  const data = await page.evaluate(async (ms) => {
    const canvas = document.createElement("canvas");

    canvas.width = 640;
    canvas.height = 360;

    const context = canvas.getContext("2d")!;
    const started = performance.now();
    const draw = (): void => {
      const elapsed = performance.now() - started;

      context.fillStyle = `hsl(${Math.round(elapsed / 10) % 360} 80% 50%)`;
      context.fillRect(0, 0, 640, 360);
      context.fillStyle = "#fff";
      context.fillRect(Math.round(elapsed / 10) % 600, 160, 40, 40);
    };

    draw();

    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: "video/webm;codecs=vp8" });
    const chunks: Blob[] = [];
    const stopped = new Promise(resolve => (recorder.onstop = resolve));
    const timer = setInterval(draw, 1000 / 30);

    recorder.ondataavailable = event => chunks.push(event.data);
    recorder.start(100);
    await new Promise(resolve => setTimeout(resolve, ms));
    recorder.stop();
    await stopped;
    clearInterval(timer);

    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = "";

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary);
  }, seconds * 1000);

  return { $nf: "blob", type: "video/webm", data };
}

function upload(name: string, blob: TEncodedBlob): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: blob.type, buffer: Buffer.from(blob.data, "base64") };
}

/**
 * Counts the frames of a library item's file, in the page.
 *
 * @param page - Any page.
 * @param popup - The popup, to ask the background.
 * @param id - The item.
 * @returns The frame count.
 */
async function frameCount(page: Page, popup: Page, id: string): Promise<number> {
  const file = (await request<TEncodedBlob>(popup, "library:file", { id })).data!;

  return page.evaluate(async ({ type, data }) => {
    const decoder = new ImageDecoder({ data: Uint8Array.from(atob(data), char => char.charCodeAt(0)), type });

    await decoder.tracks.ready;
    await decoder.completed;

    return decoder.tracks.selectedTrack!.frameCount;
  }, file);
}

test.describe("video to GIF", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await openPopup(popup, extensionId);
  });

  const list = async (): Promise<TListed[]> => (await request<TListed[]>(popup, "library:list")).data!;

  test("a 3 second clip becomes an animated sticker under the upload limit, made in a worker", async ({ page }) => {
    await openDiscord(page);
    await page.getByRole("button", { name: "Open Nitfree" }).click();

    const video = upload("party clip.webm", await recordVideo(page, 4));
    const chooser = page.waitForEvent("filechooser");

    await panel(page).getByRole("banner").getByRole("button", { name: "Add Files" }).click();
    await (await chooser).setFiles([video]);

    // The video opens straight into making its GIF: its first 3 seconds, at a sticker's size.
    const editor = videoEditor(page);

    await expect(editor.locator("[data-size]")).toHaveText("320 × 180 · 45 frames");
    await expect(editor.locator("[data-clip]")).toHaveText("0 sec to 3 sec · 3 sec · up to 10 sec");
    await expect(editor.getByRole("radio", { name: "15 fps" })).toHaveAttribute("aria-checked", "true");
    await expect(editor.getByRole("radio", { name: "320 px" })).toHaveAttribute("aria-checked", "true");

    const worker = page.waitForEvent("worker");

    await editor.getByRole("button", { name: "Apply" }).click();
    await worker;
    await expect(editor).toHaveCount(0, { timeout: 30_000 });

    const dialog = addDialog(page);

    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("party_clip");
    await expect(dialog.getByRole("radio", { name: "Sticker" })).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("button", { name: "Add 1 file" }).click();
    await expect(tile(page, "party_clip")).toBeVisible();

    const [item] = await list();

    expect(item).toMatchObject({ title: "party_clip", type: "sticker", width: 320, height: 180, animated: true, mime: "image/gif" });
    expect(item!.size).toBeLessThan(10 * 1024 * 1024);
    expect(await frameCount(page, popup, item!.id)).toBe(45);
  });

  test("the clip, frame rate and size are picked, kept to make the GIF again, and a cancelled video is not added", async () => {
    const video = await recordVideo(popup, 3);
    const chooser = popup.waitForEvent("filechooser");

    await popup.getByRole("button", { name: "Add Files" }).click();
    await (await chooser).setFiles([upload("wave.webm", video), upload("other.webm", video)]);

    // Each video opens in turn; the first one is cancelled.
    const editor = videoEditor(popup);
    const dialog = addDialog(popup);

    await expect(editor.locator("[data-size]")).toBeVisible();
    await editor.locator("footer").getByRole("button", { name: "Cancel" }).click();
    await expect(editor.locator("[data-size]")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Make a GIF" })).toHaveCount(2);

    await editor.getByRole("slider", { name: "Start" }).fill("0.5");
    await editor.getByRole("slider", { name: "End" }).fill("2.5");
    await editor.getByRole("radio", { name: "10 fps" }).click();
    await editor.getByRole("radio", { name: "480 px" }).click();
    await expect(editor.locator("[data-size]")).toHaveText("480 × 270 · 20 frames");
    await expect(editor.locator("[data-clip]")).toContainText("0.5 sec to 2.5 sec · 2 sec");

    const worker = popup.waitForEvent("worker");

    await editor.getByRole("button", { name: "Apply" }).click();
    await worker;
    await expect(editor).toHaveCount(0, { timeout: 30_000 });

    // Larger than a sticker, it is a GIF; opened again, it shows the clip it was made from.
    const made = dialog.locator("fieldset", { has: popup.getByRole("button", { name: "Edit clip" }) });

    await expect(made.getByRole("radio", { name: "GIF" })).toHaveAttribute("aria-checked", "true");
    await made.getByRole("button", { name: "Edit clip" }).click();
    await expect(editor.locator("[data-size]")).toHaveText("480 × 270 · 20 frames");
    await expect(editor.getByRole("radio", { name: "10 fps" })).toHaveAttribute("aria-checked", "true");
    await popup.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);

    // The video left as it is cannot be added.
    await expect(dialog.getByRole("button", { name: "Make a GIF" })).toHaveCount(1);
    await dialog.getByRole("button", { name: "Add 1 file" }).click();
    await expect(dialog).toHaveCount(0);

    const items = await list();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "other", type: "gif", width: 480, height: 270, animated: true });
    expect(await frameCount(popup, popup, items[0]!.id)).toBe(20);
  });
});
