import type { Page } from "@playwright/test";

import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup } from "./helpers";



type TStoredFont = { faces: Array<{ url: string; weight: string; unicodeRange: string; data: string }> };

// Noto Sans stands in for Discord's gg sans, served where Discord keeps its fonts.
const FONT = fs.readFileSync(path.resolve(import.meta.dirname, "../node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2"));

const FACES = `
  @font-face { font-family: "gg sans"; font-weight: 400; src: url("/assets/gg-400.woff") format("woff"), url("/assets/gg-400.woff2") format("woff2"); }
  @font-face { font-family: "gg sans"; font-weight: 600; src: url(/assets/gg-600.woff2) format("woff2"); unicode-range: U+0000-00FF; }
  @font-face { font-family: "gg sans"; font-weight: 400; font-style: italic; src: url(/assets/gg-400-italic.woff2); }
  @font-face { font-family: "gg sans"; font-weight: 800; src: url(/assets/gg-800.woff2); }
  @font-face { font-family: "Other"; font-weight: 400; src: url(/assets/other.woff2); }
`;

async function stored(page: Page): Promise<TStoredFont | undefined> {
  return page.evaluate(async () => {
    const { chrome } = globalThis as unknown as { chrome: { storage: { local: { get: (key: string) => Promise<Record<string, TStoredFont>> } } } };

    return (await chrome.storage.local.get("discordFont")).discordFont;
  });
}

test("Discord's typeface is kept from a Discord tab and used by the popup, with Noto Sans until then", async ({ context, extensionId }) => {
  const popup = await context.newPage();

  await openPopup(popup, extensionId);

  // Before any Discord tab, the bundled Noto Sans.
  await expect.poll(() => popup.evaluate(() => document.fonts.check("16px \"Noto Sans\""))).toBe(true);
  expect(await popup.evaluate(() => [...document.fonts].some(face => face.family === "gg sans"))).toBe(false);
  expect(await popup.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"gg sans", "Noto Sans"/);

  const page = await context.newPage();
  const fetched: string[] = [];

  await openDiscord(page);
  await context.route("https://discord.com/assets/**", (route) => {
    fetched.push(new URL(route.request().url()).pathname);

    return route.fulfill({ contentType: "font/woff2", body: FONT });
  });
  await page.addStyleTag({ content: FACES });

  // Only the upright weights the popup uses, and the WOFF2 file of each.
  await expect.poll(() => stored(popup), { timeout: 15_000 }).toBeTruthy();

  const font = (await stored(popup))!;

  expect(font.faces.map(({ url, weight, unicodeRange }) => ({ url, weight, unicodeRange }))).toEqual([
    { url: "https://discord.com/assets/gg-400.woff2", weight: "400", unicodeRange: "" },
    { url: "https://discord.com/assets/gg-600.woff2", weight: "600", unicodeRange: "U+0-FF" },
  ]);
  expect(Buffer.from(font.faces[0]!.data, "base64").equals(FONT)).toBe(true);

  // Opened again, the popup uses it, without going to Discord itself.
  const requests: string[] = [];

  popup.on("request", request => requests.push(request.url()));
  await openPopup(popup, extensionId);

  await expect.poll(() => popup.evaluate(() => [...document.fonts].filter(face => face.family === "gg sans" && face.status === "loaded").map(face => face.weight).sort())).toEqual(["400", "600"]);
  expect(await popup.evaluate(() => document.fonts.check("600 16px \"gg sans\""))).toBe(true);
  expect(requests.filter(url => url.startsWith("https://discord.com"))).toEqual([]);

  // A Discord tab opened again with the same files does not fetch them again.
  const before = fetched.length;

  await page.reload();
  await page.addStyleTag({ content: FACES });
  await page.waitForTimeout(6000);
  expect(fetched).toHaveLength(before);
});
