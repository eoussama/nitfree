import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, request } from "./helpers";
import { png } from "./images";



type TSent = { text: string; files: { name: string; width: number }[] };

const messageBox = (page: Page) => page.getByRole("textbox");
const discordList = (page: Page) => page.locator("#channel-autocomplete");
const rows = (page: Page) => discordList(page).getByRole("option");
const names = (page: Page) => rows(page).locator("[class^=\"autocompleteRowHeading_\"], [class*=\" autocompleteRowHeading_\"]");
// Nitfree's own list, for when Discord suggests nothing.
const ownList = (page: Page) => page.locator("[data-nitfree-suggestions]").getByRole("listbox");
const ownNames = (page: Page) => ownList(page).getByRole("option").locator(".name");

const DISCORD_ROWS = [":cat:", ":smile_cat:", ":catdance:"];
// Of every type, the emoji first: the sticker starts with the name too, the other emoji only holds it.
const NITFREE_ROWS = [":cat_jam:", ":cat_sticker:", ":blobcat:"];

async function sent(page: Page): Promise<TSent[]> {
  return page.evaluate(() => Promise.all((globalThis as unknown as { discordSent: { text: string; files: File[] }[] }).discordSent.map(async ({ text, files }) => ({
    text,
    files: await Promise.all(files.map(async file => ({ name: file.name, width: (await createImageBitmap(file)).width }))),
  }))));
}

async function discordPicks(page: Page): Promise<string[]> {
  return page.evaluate(() => (globalThis as unknown as { discordAutocompletePicks: string[] }).discordAutocompletePicks);
}

// The rows that look highlighted: Discord's selected one, unless Nitfree's took the highlight.
async function highlighted(page: Page): Promise<string[]> {
  return rows(page).evaluateAll(options => options
    .filter(option => getComputedStyle(option.firstElementChild!).backgroundColor !== "rgba(0, 0, 0, 0)" && option.getAttribute("aria-selected") === "true")
    .map(option => option.querySelector("[class*=\"autocompleteRowHeading_\"]")!.textContent!));
}

async function type(page: Page, text: string): Promise<void> {
  await messageBox(page).click();
  await page.keyboard.type(text);
}

test.describe("emoji suggestions", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId, page }) => {
    popup = await context.newPage();
    await openPopup(popup, extensionId);

    const kitty = (await request<{ id: string }>(popup, "tags:add", { name: "kitty" })).data!;

    await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: "cat_jam" });
    await request(popup, "library:add", { file: png(64, 64, [200, 40, 40, 255]), type: "emoji", title: "blobcat", tags: [kitty.id] });
    await request(popup, "library:add", { file: png(160, 160), type: "sticker", title: "cat_sticker" });
    await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: "dog" });
    await openDiscord(page);
  });

  test("typing :cat adds matching Nitfree emojis at the end of Discord's list, as its own rows, and Enter sends the chosen one", async ({ page }) => {
    await type(page, "hey :cat");

    // Drawn again by Discord on every key, the list keeps them at its end, and there is no list of Nitfree's own.
    await expect(names(page)).toHaveText([...DISCORD_ROWS, ...NITFREE_ROWS]);
    await expect(ownList(page)).toHaveCount(0);

    // Copies of Discord's own emoji row, image and all, without the line naming a server.
    const look = await rows(page).evaluateAll(options => options.map(option => ({ classes: option.className, server: option.querySelector("[class*=\"autocompleteRowContentSecondary_\"]") !== null, image: option.querySelector("img")?.className ?? null })));

    expect(look[3]).toEqual({ classes: look[2]!.classes, server: false, image: look[2]!.image });

    // Each says what it is, at its end, where Discord's rows name their server.
    await expect(rows(page).locator("[data-nitfree-type]")).toHaveText(["Emoji", "Sticker", "Emoji"]);
    await expect(ownList(page)).toHaveCount(0);

    // Discord keeps the keys: its first row is highlighted, and the arrows move through its rows first.
    expect(await highlighted(page)).toEqual([":cat:"]);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    expect(await highlighted(page)).toEqual([":catdance:"]);

    // Past its last row, onto Nitfree's, and around again to Discord's first.
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => highlighted(page)).toEqual([":cat_jam:"]);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => highlighted(page)).toEqual([":cat_sticker:"]);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => highlighted(page)).toEqual([":blobcat:"]);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => highlighted(page)).toEqual([":cat:"]);

    // Up from Discord's first row onto Nitfree's last, and on up to Discord's last.
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => highlighted(page)).toEqual([":blobcat:"]);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => highlighted(page)).toEqual([":catdance:"]);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // The :cat text goes, the emoji goes with the message, at the emoji size, and Discord picked nothing.
    await expect.poll(() => sent(page)).toEqual([{ text: "hey", files: [{ name: "cat_jam.png", width: 48 }] }]);
    expect(await discordPicks(page)).toEqual([]);
    await expect(page.locator("[data-nitfree-option]")).toHaveCount(0);
  });

  test("while Discord's own rows are highlighted, Enter is Discord's", async ({ page }) => {
    await type(page, ":cat");
    await expect(names(page)).toHaveText([...DISCORD_ROWS, ...NITFREE_ROWS]);
    await page.keyboard.press("Enter");

    expect(await discordPicks(page)).toEqual([":cat:"]);
    expect(await sent(page)).toEqual([]);
    await expect(page.locator("[data-nitfree-option]")).toHaveCount(0);
  });

  test("when Discord has nothing to suggest, a list like its own shows them, with the keys; Tab adds without sending", async ({ page }) => {
    await type(page, ":kit");
    await expect(discordList(page)).toHaveCount(0);
    await expect(page.getByRole("listbox", { name: "Emoji matching :kit" })).toBeVisible();
    await expect(ownNames(page)).toHaveText([":blobcat:"]);
    await expect(ownList(page).getByRole("option")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Tab");

    await expect(page.locator("[data-list-id=\"attachments\"] [data-list-item-id]")).toHaveText(["blobcat.png"]);
    await expect(messageBox(page)).toHaveText("");
    expect(await sent(page)).toEqual([]);

    // A click picks like Enter.
    await page.keyboard.type("and :do");
    await ownList(page).getByRole("option", { name: ":dog:" }).click();
    await expect.poll(() => sent(page)).toEqual([{ text: "and", files: [{ name: "blobcat.png", width: 48 }, { name: "dog.png", width: 48 }] }]);
    await expect(messageBox(page)).toBeFocused();
  });

  test("Escape closes Discord's list with Nitfree's rows, until something else is typed", async ({ page }) => {
    await type(page, ":cat");
    await expect(page.locator("[data-nitfree-option]")).toHaveCount(3);

    await page.keyboard.press("Escape");
    await expect(discordList(page)).toHaveCount(0);
    await expect(page.locator("[data-nitfree-option], [data-nitfree-suggestions]")).toHaveCount(0);

    // Discord has no emoji named cat_, so Nitfree's list shows on its own.
    await page.keyboard.type("_");
    await expect(ownNames(page)).toHaveText([":cat_jam:", ":cat_sticker:"]);
  });

  test("stickers, GIFs and images are suggested too, and sent as what they are", async ({ page }) => {
    await request(popup, "library:add", { file: png(400, 300, [60, 180, 120, 255]), type: "image", title: "Screenshot_2024_05_30" });
    await type(page, ":Screenshot_2024");
    await expect(ownNames(page)).toHaveText([":Screenshot_2024_05_30:"]);
    await page.keyboard.press("Enter");
    await expect.poll(() => sent(page)).toEqual([{ text: "", files: [{ name: "Screenshot_2024_05_30.png", width: 400 }] }]);

    await page.keyboard.type(":cat_s");
    await expect(ownNames(page)).toHaveText([":cat_sticker:"]);
    await page.keyboard.press("Enter");
    await expect.poll(() => sent(page)).toHaveLength(2);
    expect((await sent(page))[1]!.files).toEqual([{ name: "cat_sticker.png", width: 160 }]);
  });

  test("set in the popup, the suggestions come before Discord's, with the keys going around the same way", async ({ page }) => {
    await popup.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
    await popup.getByRole("radio", { name: "Before Discord's emojis" }).check();

    await type(page, ":cat");
    await expect(names(page)).toHaveText([...NITFREE_ROWS, ...DISCORD_ROWS]);

    // Discord's first row keeps the highlight; up from it reaches Nitfree's last, and down from there comes back.
    expect(await highlighted(page)).toEqual([":cat:"]);
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => highlighted(page)).toEqual([":blobcat:"]);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => highlighted(page)).toEqual([":cat:"]);

    // Down past Discord's last row reaches Nitfree's first, at the top.
    for (let i = 0; i < DISCORD_ROWS.length; i++) {
      await page.keyboard.press("ArrowDown");
    }

    await expect.poll(() => highlighted(page)).toEqual([":cat_jam:"]);
    await page.keyboard.press("Enter");
    await expect.poll(() => sent(page)).toEqual([{ text: "", files: [{ name: "cat_jam.png", width: 48 }] }]);
  });

  test("nothing is added for short or finished names, or once turned off in the popup", async ({ page }) => {
    await type(page, ":c");
    await expect(page.locator("[data-nitfree-option], [data-nitfree-suggestions]")).toHaveCount(0);
    await page.keyboard.type("at:");
    await expect(page.locator("[data-nitfree-option], [data-nitfree-suggestions]")).toHaveCount(0);

    await popup.getByRole("navigation").getByRole("button", { name: "Settings" }).click();
    await popup.getByRole("switch", { name: "Suggest items while typing" }).uncheck();

    await page.keyboard.type(" :cat");
    await expect(names(page)).toHaveText(DISCORD_ROWS);
    await expect(page.locator("[data-nitfree-option], [data-nitfree-suggestions]")).toHaveCount(0);
  });
});
