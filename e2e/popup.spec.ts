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

  test("the header stays at the top while the popup scrolls", async () => {
    const header = popup.locator("header");

    // At rest, no line under the header.
    await expect(header).not.toHaveClass(/scrolled/);
    expect(await header.evaluate(element => getComputedStyle(element).borderBottomColor)).toBe("rgba(0, 0, 0, 0)");
    expect(await library(popup).evaluate(element => getComputedStyle(element).borderTopStyle)).toBe("none");

    await popup.mouse.wheel(0, 400);
    await expect.poll(() => popup.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    expect((await header.boundingBox())!.y).toBe(0);
    await expect(header).toHaveClass(/scrolled/);
    // Nothing shows through it.
    expect(await header.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("the logo's eyes follow the pointer, and it blinks now and then", async ({ extensionId }) => {
    await popup.clock.install();
    await openPopup(popup, extensionId);

    const logo = popup.getByRole("img", { name: "Nitfree logo" });
    const eyes = logo.locator(".look");
    const offset = () => eyes.evaluate(element => new DOMMatrix(getComputedStyle(element).transform)).then(({ e, f }) => ({ x: e, y: f }));
    const box = (await logo.boundingBox())!;

    // Down and to the right of the logo, the eyes look that way.
    await popup.mouse.move(box.x + box.width + 200, box.y + box.height + 200);
    await expect.poll(async () => (await offset()).x).toBeGreaterThan(10);
    expect((await offset()).y).toBeGreaterThan(10);

    // To the left, they turn.
    await popup.mouse.move(0, box.y + box.height / 2);
    await expect.poll(async () => (await offset()).x).toBeLessThan(-1);

    // Within a few seconds, a blink.
    await expect(logo.locator("svg")).not.toHaveClass(/blinking/);
    await popup.clock.fastForward(7000);
    await expect(logo.locator("svg")).toHaveClass(/blinking/);
    await popup.clock.fastForward(1000);
    await expect(logo.locator("svg")).not.toHaveClass(/blinking/);
  });

  test("with reduced motion, the logo stays still", async ({ extensionId }) => {
    await popup.emulateMedia({ reducedMotion: "reduce" });
    await popup.clock.install();
    await openPopup(popup, extensionId);

    const logo = popup.getByRole("img", { name: "Nitfree logo" });
    const box = (await logo.boundingBox())!;

    await popup.mouse.move(box.x + 300, box.y + 300);
    await popup.clock.fastForward(10_000);

    expect(await logo.locator(".look").evaluate((element) => {
      const { e, f } = new DOMMatrix(getComputedStyle(element).transform);

      return [e, f];
    })).toEqual([0, 0]);
    await expect(logo.locator("svg")).not.toHaveClass(/blinking/);
  });

  test("a GitHub link at the end of the header opens the repository, with a tooltip", async () => {
    const link = popup.locator("header").getByRole("link", { name: "View Nitfree on GitHub" });

    await expect(link).toHaveAttribute("href", "https://github.com/eoussama/nitfree");
    await expect(link).toHaveAttribute("target", "_blank");

    const header = (await popup.locator("header").boundingBox())!;
    const box = (await link.boundingBox())!;

    expect(header.x + header.width - (box.x + box.width)).toBeLessThanOrEqual(16);

    await link.hover();
    await expect(popup.getByRole("tooltip")).toHaveText("View Nitfree on GitHub");
    expect((await popup.getByRole("tooltip").boundingBox())!.y).toBeGreaterThan(box.y + box.height);
  });
});
