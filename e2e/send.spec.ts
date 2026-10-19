import type { Page } from "@playwright/test";
import type { TEncodedBlob } from "./images";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, request } from "./helpers";
import { gif, png } from "./images";



type TSentFile = { name: string; type: string; width: number; height: number; frames: number; duration: number };

const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const tile = (page: Page, title: string) => page.locator(`[data-tile][aria-label="${title}"]`).last();
const tray = (page: Page) => page.locator("[data-list-id=\"attachments\"] [data-list-item-id]");
const picker = (page: Page) => page.locator("[class*=\"expressionPickerPositionLayer\"]");

/**
 * What Discord received: each sent message's files, with their size and animation read back.
 *
 * @param page - The Discord page.
 * @returns One list of files per sent message.
 */
async function sent(page: Page): Promise<TSentFile[][]> {
  return page.evaluate(async () => {
    const messages = (globalThis as unknown as { discordSent: Array<{ files: File[] }> }).discordSent;

    return Promise.all(messages.map(message => Promise.all(message.files.map(async (file) => {
      const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });

      await decoder.tracks.ready;
      await decoder.completed;

      const { image } = await decoder.decode({ frameIndex: 0 });
      const result = {
        name: file.name,
        type: file.type,
        width: image.displayWidth,
        height: image.displayHeight,
        frames: decoder.tracks.selectedTrack?.frameCount ?? 1,
        duration: (image.duration ?? 0) / 1000,
      };

      image.close();
      decoder.close();

      return result;
    }))));
  });
}

/**
 * The alpha of the center pixel of each frame of the first file Discord received.
 *
 * @param page - The Discord page.
 * @returns One alpha value per frame.
 */
async function frameAlphas(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const [{ files: [file] }] = (globalThis as unknown as { discordSent: Array<{ files: File[] }> }).discordSent as [{ files: [File] }];
    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });

    await decoder.tracks.ready;
    await decoder.completed;

    const alphas: number[] = [];

    for (let index = 0; index < (decoder.tracks.selectedTrack?.frameCount ?? 1); index++) {
      const { image } = await decoder.decode({ frameIndex: index });
      const canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight);
      const context = canvas.getContext("2d")!;

      context.drawImage(image, 0, 0);
      alphas.push(context.getImageData(image.displayWidth / 2, image.displayHeight / 2, 1, 1).data[3]!);
      image.close();
    }

    decoder.close();

    return alphas;
  });
}

/**
 * How often the first file Discord received plays again after the first time.
 *
 * @param page - The Discord page.
 * @returns The decoder's repetition count.
 */
async function repetitions(page: Page): Promise<number | undefined> {
  return page.evaluate(async () => {
    const [{ files: [file] }] = (globalThis as unknown as { discordSent: Array<{ files: File[] }> }).discordSent as [{ files: [File] }];
    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });

    await decoder.tracks.ready;

    const count = decoder.tracks.selectedTrack?.repetitionCount;

    decoder.close();

    return count;
  });
}

test.describe("sending", () => {
  let popup: Page;

  async function add(title: string, type: string, file: TEncodedBlob): Promise<string> {
    const reply = await request<{ id: string }>(popup, "library:add", { file, type, title });

    expect(reply.ok).toBe(true);

    return reply.data!.id;
  }

  async function openPanel(page: Page, options: { picker?: boolean } = {}): Promise<void> {
    await openDiscord(page, options);
    await page.getByRole("button", { name: "Open Nitfree" }).click();
  }

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await openPopup(popup, extensionId);
  });

  test("a click sends an emoji at Discord's 48 px, and closes the panel", async ({ page }) => {
    const id = await add("wide", "emoji", png(512, 256));

    await openPanel(page);
    await tile(page, "wide").click();

    await expect(panel(page)).toHaveCount(0);
    await expect.poll(() => sent(page)).toEqual([[{ name: "wide.png", type: "image/png", width: 48, height: 24, frames: 1, duration: 0 }]]);

    // The sized copy is kept for next time, and the item counts as used.
    expect((await request(popup, "library:variant", { id, key: "emoji-48" })).data).toMatchObject({ $nf: "blob", type: "image/png" });
    await expect.poll(async () => (await request<{ usageCount: number }>(popup, "library:get", { id })).data?.usageCount).toBe(1);
  });

  test("an animated emoji arrives at 48 px and still animates", async ({ page }) => {
    await add("party", "emoji", gif(512, 512, [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]], 120, 2));

    await openPanel(page);
    await tile(page, "party").click();

    await expect.poll(() => sent(page)).toEqual([[{ name: "party.gif", type: "image/gif", width: 48, height: 48, frames: 3, duration: 120 }]]);
    // It loops as often as the original.
    expect(await repetitions(page)).toBe(2);
  });

  test("each frame of a transparent animation replaces the last, leaving no trail", async ({ page }) => {
    await add("blink", "emoji", gif(256, 256, [[255, 0, 0, 255], [0, 0, 0, 0], [255, 0, 0, 255]], 100));

    await openPanel(page);
    await tile(page, "blink").click();

    await expect.poll(async () => (await sent(page)).length).toBe(1);
    expect(await frameAlphas(page)).toEqual([255, 0, 255]);
  });

  test("Shift+click adds the item to the message without sending, and keeps the panel open", async ({ page }) => {
    await add("wave", "emoji", png(128, 128));
    await add("cat", "emoji", png(64, 64));

    await openPanel(page);
    await tile(page, "wave").click({ modifiers: ["Shift"] });
    await tile(page, "cat").click({ modifiers: ["Shift"] });

    await expect(tray(page)).toHaveText(["wave.png", "cat.png"]);
    await expect(panel(page)).toBeVisible();
    expect(await sent(page)).toEqual([]);

    // Enter sends both with the message, as in Discord.
    await page.locator("[role=\"textbox\"]").press("Enter");
    await expect.poll(async () => (await sent(page))[0]?.map(file => [file.name, file.width])).toEqual([["wave.png", 48], ["cat.png", 48]]);
  });

  test("a click right after a Shift+click sends both together, leaving nothing behind", async ({ page }) => {
    // The first takes much longer to prepare than the second.
    await add("wave", "emoji", gif(512, 512, Array.from({ length: 24 }, (_, i) => [i * 10, 0, 255 - i * 10, 255]), 100));
    await add("cat", "emoji", png(128, 128));

    await openPanel(page);
    await tile(page, "wave").click({ modifiers: ["Shift"] });
    await tile(page, "cat").click();

    await expect.poll(async () => (await sent(page)).map(message => message.map(file => file.name))).toEqual([["wave.gif", "cat.png"]]);
    await expect(tray(page)).toHaveCount(0);
  });

  test("stickers go at 160 px, still animating; GIFs, images and small emojis as they are", async ({ page }) => {
    await add("sticker", "sticker", png(400, 320));
    await add("dance", "sticker", gif(320, 320, [[255, 0, 0, 255], [0, 0, 255, 255]], 150));
    await add("photo", "image", png(300, 200));
    await add("clip", "gif", gif(240, 120, [[0, 0, 0, 255], [255, 255, 255, 255]], 80));
    await add("tiny", "emoji", png(32, 20));

    await openPanel(page);

    for (const title of ["sticker", "dance", "photo", "clip", "tiny"]) {
      await page.getByRole("button", { name: "Open Nitfree" }).click();
      await tile(page, title).click();
      await expect(panel(page)).toHaveCount(0);
    }

    await expect.poll(() => sent(page)).toEqual([
      [{ name: "sticker.png", type: "image/png", width: 160, height: 128, frames: 1, duration: 0 }],
      [{ name: "dance.gif", type: "image/gif", width: 160, height: 160, frames: 2, duration: 150 }],
      [{ name: "photo.png", type: "image/png", width: 300, height: 200, frames: 1, duration: 0 }],
      [{ name: "clip.gif", type: "image/gif", width: 240, height: 120, frames: 2, duration: 80 }],
      [{ name: "tiny.png", type: "image/png", width: 32, height: 20, frames: 1, duration: 0 }],
    ]);
  });

  test("a click in Discord's picker sends and closes the picker", async ({ page }) => {
    await add("wave", "emoji", png(96, 96));

    await openPanel(page, { picker: true });
    await tile(page, "wave").click();

    await expect(picker(page)).toHaveCount(0);
    await expect.poll(async () => (await sent(page))[0]?.[0]?.width).toBe(48);
  });

  test("files over Discord's upload limit are refused with a notice", async ({ page }) => {
    await add("huge", "image", png(16, 16, undefined, 11 * 1024 * 1024));

    await openPanel(page);
    await tile(page, "huge").click();

    await expect(page.getByRole("alert")).toHaveText("“huge” is over Discord's 10 MB upload limit.");
    expect(await sent(page)).toEqual([]);
  });

  test("says so when the message box cannot be found", async ({ page }) => {
    await add("wave", "emoji", png(96, 96));

    await openPanel(page);
    await page.evaluate(() => document.querySelector("input[type=\"file\"]")?.remove());
    await tile(page, "wave").click();

    await expect(page.getByRole("alert")).toHaveText("Nitfree could not find the message box to send to.");
  });
});
