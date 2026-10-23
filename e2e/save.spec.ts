import type { Locator, Page } from "@playwright/test";

import type { TEncodedBlob } from "./images";

import { Buffer } from "node:buffer";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, request } from "./helpers";
import { png } from "./images";



type TListed = { id: string; title: string; type: string; width: number; tags: string[] };

const EMOJI = png(64, 64, [250, 200, 40, 255]);
const STICKER = png(160, 160, [240, 70, 120, 255]);
const ATTACHMENT = png(400, 300, [60, 180, 120, 255]);

/**
 * What Discord's CDN and media proxy serve, by path; the page shows the same files under other names.
 */
const MEDIA: Record<string, TEncodedBlob> = {
  "/emojis/111.png": EMOJI,
  "/emojis/111.webp": EMOJI,
  "/stickers/222.png": STICKER,
  "/stickers/222.webp": STICKER,
  "/attachments/1/2/Party%20Parrot.png": ATTACHMENT,
};

const discordMenu = (page: Page) => page.getByRole("menu", { name: "Message Actions" });
const saveItem = (page: Page) => discordMenu(page).getByRole("menuitem", { name: "Save to Nitfree" });
const addDialog = (page: Page) => page.getByRole("dialog", { name: "Add to Nitfree" });
const DISCORD_ITEMS = ["Reply", "Forward", "Copy Message Link", "Delete Message"];

async function list(popup: Page): Promise<TListed[]> {
  return (await request<TListed[]>(popup, "library:list")).data!;
}

async function save(page: Page, target: Locator): Promise<void> {
  await target.click({ button: "right" });
  await saveItem(page).click();
  await expect(discordMenu(page)).toHaveCount(0);
  await expect(addDialog(page)).toBeVisible();
}

test.describe("saving from chat", () => {
  let requested: string[];

  test.beforeEach(async ({ context, page }) => {
    requested = [];

    await context.route(/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//, async (route) => {
      const url = new URL(route.request().url());
      const image = MEDIA[url.pathname];

      requested.push(url.href);
      await (image
        ? route.fulfill({ contentType: image.type, body: Buffer.from(image.data, "base64"), headers: { "access-control-allow-origin": "*" } })
        : route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" } }));
    });

    await openDiscord(page, { messages: true });
  });

  test("right-clicking a custom emoji in a message saves it as an emoji, with the tags given before saving", async ({ context, extensionId, page }) => {
    await page.locator("img.emoji").click({ button: "right" });

    // First in Discord's own menu, which stays as it was otherwise.
    await expect(discordMenu(page).getByRole("menuitem")).toHaveText(["Save to Nitfree", ...DISCORD_ITEMS]);

    // Like Discord's items: the icon before the text, and the text in their font.
    const look = await saveItem(page).evaluate((item) => {
      const reply = item.closest("[role=\"menu\"]")!.querySelector("#message-reply")!;
      const font = (element: Element) => {
        const text = [element, ...element.querySelectorAll("*")].findLast(found => found.textContent?.trim())!;
        const style = getComputedStyle(text);

        return `${style.fontSize} ${style.fontWeight} ${style.lineHeight}`;
      };

      return { iconFirst: Boolean(item.firstElementChild?.querySelector("svg")), font: font(item), discordFont: font(reply) };
    });

    expect(look).toEqual({ iconFirst: true, font: "14px 500 18px", discordFont: "14px 500 18px" });

    await saveItem(page).click();
    await expect(discordMenu(page)).toHaveCount(0);

    const dialog = addDialog(page);

    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("blob_cat");
    await expect(dialog.getByRole("radio", { name: "Emoji" })).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("combobox", { name: "Tags" }).pressSequentially("cats,");
    await dialog.getByRole("button", { name: "Add 1 file" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Saved “blob_cat” to Nitfree.")).toBeVisible();

    const popup = await context.newPage();

    await openPopup(popup, extensionId);

    const [item] = await list(popup);
    const tags = (await request<{ id: string; name: string }[]>(popup, "tags:list")).data!;

    expect(item).toMatchObject({ title: "blob_cat", type: "emoji", width: 64 });
    expect(item!.tags).toEqual(tags.filter(tag => tag.name === "cats").map(tag => tag.id));
    // The uploaded emoji, not the small copy the message shows.
    expect(requested).toContain("https://cdn.discordapp.com/emojis/111.png");
    expect(await page.evaluate(() => (globalThis as unknown as { discordMenuChoices: string[] }).discordMenuChoices)).toEqual([]);
  });

  test("a sticker and an attached image are saved whole, named and typed after what they are", async ({ page }) => {
    await save(page, page.locator("img[data-type=\"sticker\"]"));
    await expect(addDialog(page).getByRole("textbox", { name: "Name" })).toHaveValue("Wave");
    await expect(addDialog(page).getByRole("radio", { name: "Sticker" })).toHaveAttribute("aria-checked", "true");
    expect(requested).toContain("https://media.discordapp.net/stickers/222.png");
    await addDialog(page).getByRole("button", { name: "Cancel" }).first().click();

    // The right click lands on the invisible link Discord lays over the image.
    await save(page, page.getByTestId("attachment"));
    await expect(addDialog(page).getByRole("textbox", { name: "Name" })).toHaveValue("Party_Parrot");
    await expect(addDialog(page).getByRole("radio", { name: "Image" })).toHaveAttribute("aria-checked", "true");
    expect(requested).toContain("https://cdn.discordapp.com/attachments/1/2/Party%20Parrot.png?ex=a&is=b&hm=c");
  });

  test("Discord's menu is left alone elsewhere in a message, and on stickers that are not images", async ({ page }) => {
    for (const target of [page.locator("[class^=\"messageContent_\"]"), page.getByTestId("lottie")]) {
      await target.click({ button: "right", position: { x: 4, y: 4 } });
      await expect(discordMenu(page).getByRole("menuitem")).toHaveText(DISCORD_ITEMS);
      await page.keyboard.press("Escape");
      await expect(discordMenu(page)).toHaveCount(0);
    }
  });

  test("an emoji already added from disk, as another file, is flagged before saving a second copy", async ({ context, extensionId, page }) => {
    const popup = await context.newPage();

    // The same picture, at another size: not the file Discord serves, but the same emoji.
    await openPopup(popup, extensionId);
    await request(popup, "library:add", { file: png(128, 128, [250, 200, 40, 255]), type: "emoji", title: "my_blob" });
    await page.bringToFront();

    await save(page, page.locator("img.emoji"));
    await expect(addDialog(page)).toContainText("This looks like “my_blob”, already in your library. Saving it keeps a second copy.");
  });

  test("a file Discord no longer serves is said in a notice", async ({ page }) => {
    await page.route("https://media.discordapp.net/stickers/222.png", route => route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" } }));
    await page.locator("img[data-type=\"sticker\"]").click({ button: "right" });
    await saveItem(page).click();

    await expect(page.getByText(/^Could not save “Wave”: 404/)).toBeVisible();
    await expect(addDialog(page)).toHaveCount(0);
  });
});
