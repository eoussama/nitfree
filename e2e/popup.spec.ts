import type { Page } from "@playwright/test";

import { Buffer } from "node:buffer";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, PNG, request } from "./helpers";
import { gif, png } from "./images";



const IMAGE = { name: "Party Parrot.png", mimeType: "image/png", buffer: Buffer.from(PNG.data, "base64") };

const library = (page: Page) => page.getByRole("region", { name: "Library" });
const settings = (page: Page) => page.getByRole("region", { name: "Settings" });
const count = (page: Page, type: string) => library(page).locator(`dd[data-type="${type}"]`);
const addDialog = (page: Page) => page.getByRole("dialog", { name: "Add to Nitfree" });
const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const tile = (page: Page, title: string) => panel(page).getByRole("region", { name: "All files" }).locator(`[data-tile][aria-label="${title}"]`);
const tray = (page: Page) => page.locator("[data-list-id=\"attachments\"] [data-list-item-id]");

/**
 * What the popup saved in extension storage.
 *
 * @param popup - The popup page.
 * @param key - The setting's key.
 * @returns Its stored value.
 */
async function stored(popup: Page, key: string): Promise<unknown> {
  return popup.evaluate(async (name) => {
    const { chrome } = globalThis as unknown as { chrome: { storage: { local: { get: (key: string) => Promise<Record<string, unknown>> } } } };

    return (await chrome.storage.local.get(name))[name];
  }, key);
}

async function sent(page: Page): Promise<string[][]> {
  return page.evaluate(() => (globalThis as unknown as { discordSent: Array<{ files: File[] }> }).discordSent.map(message => message.files.map(file => file.name)));
}

test.describe("popup", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await openPopup(popup, extensionId);
  });

  test("shows the library at a glance, and follows changes made elsewhere", async ({ context, extensionId }) => {
    await expect(library(popup).getByText("0 items")).toBeVisible();

    await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: "a" });
    await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: "b" });
    await request(popup, "library:add", { file: gif(64, 64, [[255, 0, 0, 255], [0, 0, 255, 255]], 100), type: "gif", title: "c" });

    await expect(library(popup).getByText("3 items")).toBeVisible();
    await expect(count(popup, "emoji")).toHaveText("2");
    await expect(count(popup, "sticker")).toHaveText("0");
    await expect(count(popup, "gif")).toHaveText("1");
    await expect(count(popup, "image")).toHaveText("0");
    await expect(library(popup).getByText(/^Storage used: [\d.,]+\s?(bytes|kB|MB|GB)$/)).toBeVisible();

    // A change from another page, as from a Discord tab, shows at once.
    const other = await context.newPage();

    await openPopup(other, extensionId);
    await request(other, "library:add", { file: png(64, 64), type: "sticker", title: "d" });

    await expect(library(popup).getByText("4 items")).toBeVisible();
    await expect(count(popup, "sticker")).toHaveText("1");

    const [first] = (await request<{ id: string }[]>(other, "library:list")).data!;

    await request(other, "library:remove", { id: first!.id });
    await expect(library(popup).getByText("3 items")).toBeVisible();
  });

  test("Add Files opens the add dialog over the popup, fitting it, and saving adds the item", async () => {
    const chooser = popup.waitForEvent("filechooser");

    await popup.getByRole("button", { name: "Add Files" }).click();
    await (await chooser).setFiles(IMAGE);

    await expect(addDialog(popup)).toBeVisible();

    const box = (await addDialog(popup).boundingBox())!;
    const viewport = popup.viewportSize()!;

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    // Narrow, each file's preview sits above its fields.
    const preview = (await addDialog(popup).locator(".preview").boundingBox())!;
    const name = addDialog(popup).getByRole("textbox", { name: "Name" });

    expect((await name.boundingBox())!.y).toBeGreaterThan(preview.y + preview.height - 1);

    await name.fill("parrot");
    await addDialog(popup).getByRole("button", { name: "Add 1 file" }).click();

    await expect(addDialog(popup)).toHaveCount(0);
    await expect(library(popup).getByText("1 item", { exact: true })).toBeVisible();
    await expect(count(popup, "emoji")).toHaveText("1");
  });

  test("dropping or pasting images opens the add dialog", async () => {
    await popup.locator("main").evaluate((main, data) => {
      const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
      const dataTransfer = new DataTransfer();

      dataTransfer.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
      main.dispatchEvent(new DragEvent("dragover", { dataTransfer, bubbles: true, cancelable: true }));
      main.dispatchEvent(new DragEvent("drop", { dataTransfer, bubbles: true, cancelable: true }));
    }, PNG.data);

    await expect(addDialog(popup).getByRole("textbox", { name: "Name" })).toHaveValue("dropped");
    await popup.keyboard.press("Escape");
    await expect(addDialog(popup)).toHaveCount(0);

    await popup.evaluate((data) => {
      const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
      const clipboardData = new DataTransfer();

      clipboardData.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
      document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    }, PNG.data);

    await expect(addDialog(popup).getByRole("textbox", { name: "Name" })).toHaveValue("pasted");
  });

  test("sending sizes are saved within range, and kept on reopening", async ({ extensionId }) => {
    const emoji = settings(popup).getByRole("spinbutton", { name: "Emoji" });
    const sticker = settings(popup).getByRole("spinbutton", { name: "Sticker" });

    await expect(emoji).toHaveValue("48");
    await expect(sticker).toHaveValue("160");

    await emoji.fill("64");
    await emoji.press("Enter");
    await expect.poll(() => stored(popup, "sendSizes")).toEqual({ emoji: 64, sticker: 160 });

    // Out of range, it is brought to the nearest limit.
    await sticker.fill("999");
    await sticker.press("Enter");
    await expect(sticker).toHaveValue("320");
    await expect.poll(() => stored(popup, "sendSizes")).toEqual({ emoji: 64, sticker: 320 });

    // Emptied, it goes back to what was saved.
    await emoji.fill("");
    await emoji.press("Enter");
    await expect(emoji).toHaveValue("64");

    await openPopup(popup, extensionId);
    await expect(settings(popup).getByRole("spinbutton", { name: "Emoji" })).toHaveValue("64");
    await expect(settings(popup).getByRole("spinbutton", { name: "Sticker" })).toHaveValue("320");
  });

  test("the size set in the popup is the size an emoji is sent at", async ({ context }) => {
    await request(popup, "library:add", { file: png(256, 256), type: "emoji", title: "wave" });

    const emoji = settings(popup).getByRole("spinbutton", { name: "Emoji" });

    await emoji.fill("96");
    await emoji.press("Enter");
    await expect.poll(() => stored(popup, "sendSizes")).toEqual({ emoji: 96, sticker: 160 });

    const page = await context.newPage();

    await openDiscord(page);
    await page.getByRole("button", { name: "Open Nitfree" }).click();
    await tile(page, "wave").click();

    await expect.poll(() => page.evaluate(async () => {
      const [message] = (globalThis as unknown as { discordSent: Array<{ files: File[] }> }).discordSent;
      const file = message?.files[0];

      return file ? (await createImageBitmap(file)).width : null;
    })).toBe(96);
  });

  test("a click can be set to add to the message, Shift+click then sending", async ({ context }) => {
    await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: "wave" });
    await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: "cat" });

    await settings(popup).getByRole("radio", { name: "Adds it to the message" }).check();
    await expect.poll(() => stored(popup, "clickAction")).toBe("add");

    const page = await context.newPage();

    await openDiscord(page);
    await page.getByRole("button", { name: "Open Nitfree" }).click();

    await tile(page, "wave").click();
    await expect(tray(page)).toHaveText(["wave.png"]);
    await expect(panel(page)).toBeVisible();
    expect(await sent(page)).toEqual([]);

    await tile(page, "cat").click({ modifiers: ["Shift"] });
    await expect.poll(() => sent(page)).toEqual([["wave.png", "cat.png"]]);
    await expect(panel(page)).toHaveCount(0);

    // Changed back while Discord is open, a click sends again.
    await settings(popup).getByRole("radio", { name: "Sends it" }).check();
    await page.getByRole("button", { name: "Open Nitfree" }).click();
    await tile(page, "wave").click();
    await expect.poll(async () => (await sent(page)).length).toBe(2);
  });

  test("animated items can be kept still in the panel", async ({ context }) => {
    await request(popup, "library:add", { file: gif(128, 128, [[255, 0, 0, 255], [0, 0, 255, 255]], 100), type: "emoji", title: "party" });

    const toggle = settings(popup).getByRole("switch", { name: "Play animated items on hover" });

    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect.poll(() => stored(popup, "playAnimations")).toBe(false);

    const page = await context.newPage();

    await openDiscord(page);
    await page.getByRole("button", { name: "Open Nitfree" }).click();
    await expect(tile(page, "party").locator("img")).toBeVisible();

    const still = await tile(page, "party").locator("img").getAttribute("src");

    await tile(page, "party").hover();
    await page.waitForTimeout(500);
    await expect(tile(page, "party").locator("img")).toHaveAttribute("src", still!);

    // Turned back on, hovering plays it.
    await toggle.check();
    await page.mouse.move(0, 0);
    await tile(page, "party").hover();
    await expect(tile(page, "party").locator("img")).not.toHaveAttribute("src", still!);
  });
});
