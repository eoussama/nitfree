import type { Page } from "@playwright/test";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, openPopupPage, request } from "./helpers";
import { png } from "./images";



type TSnippet = { id: string; name: string; css: string; enabled: boolean };

const themes = (page: Page) => page.getByRole("region", { name: "Themes" });
const backup = (page: Page) => page.getByRole("region", { name: "Backup" });

/**
 * The part of Discord's stylesheet the accent color changes: the main blurple step on :root, which
 * its brand and button tokens read. Added after Nitfree's styles, as Discord adds its stylesheets as
 * it loads.
 */
const DISCORD_CSS = `
:root { --blurple-50-hsl: 234.935 calc(var(--saturation-factor, 1)*85.556%) 64.706%; --blurple-50: hsl(var(--blurple-50-hsl)/1); }
.theme-dark, .theme-light { --brand-500: var(--blurple-50); --control-primary-background-default: var(--blurple-50); }
`;

/**
 * The color a CSS variable gives, as the page draws it.
 *
 * @param page - The Discord tab.
 * @param variable - The variable.
 * @returns The color, as `rgb(...)`.
 */
async function drawn(page: Page, variable: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("div");

    probe.style.color = `var(${name})`;
    document.body.append(probe);

    const { color } = getComputedStyle(probe);

    probe.remove();

    return color;
  }, variable);
}

async function stored<T>(popup: Page, key: string): Promise<T | undefined> {
  return popup.evaluate(async (name) => {
    const { chrome } = globalThis as unknown as { chrome: { storage: { local: { get: (key: string) => Promise<Record<string, unknown>> } } } };

    return (await chrome.storage.local.get(name))[name] as never;
  }, key);
}

test.describe("Discord themes", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await openPopup(popup, extensionId);
    await openPopupPage(popup, "Themes");
  });

  test("a color theme gives Discord the look of Nitro's, and stays on when Discord resets its root's classes", async ({ page }) => {
    await openDiscord(page);

    const root = page.locator("html");
    const gradient = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--custom-theme-background").trim());

    await expect(themes(popup).getByRole("radio", { name: "Discord's default" })).toBeChecked();
    await themes(popup).getByRole("radio", { name: "Deep Ocean" }).check();
    await expect(root).toHaveClass(/custom-theme-background/);
    await expect.poll(gradient).toBe("linear-gradient(160deg, #0f2027, #203a43, #2c5364)");
    expect(await stored(popup, "colorTheme")).toBe("ocean");

    // Discord sets its root's classes anew as it renders.
    await page.evaluate(() => {
      document.documentElement.className = "theme-light";
    });
    await expect(root).toHaveClass(/custom-theme-background/);

    await themes(popup).getByRole("radio", { name: "Nebula" }).check();
    await expect.poll(gradient).toBe("linear-gradient(135deg, #120c2c, #3a1c71, #6b2a8a)");

    await themes(popup).getByRole("radio", { name: "Discord's default" }).check();
    await expect(root).not.toHaveClass(/custom-theme-background/);
    await expect(page.locator("style[data-nitfree-theme]")).toHaveCount(0);
    // None is no value at all.
    expect(await stored(popup, "colorTheme")).toBeUndefined();
  });

  test("an accent color replaces Discord's blurple at once, and Nitfree's palette follows it", async ({ page }) => {
    await openDiscord(page);
    await page.addStyleTag({ content: DISCORD_CSS });
    await expect.poll(() => drawn(page, "--control-primary-background-default")).toBe("rgb(88, 101, 242)");

    await themes(popup).getByRole("switch", { name: "Use my own accent color" }).check();

    const hex = themes(popup).getByRole("textbox", { name: "Accent color" });

    await hex.fill("#e91e63");
    await hex.press("Enter");

    // Discord's styles, added since, come before Nitfree's, which still win.
    await page.addStyleTag({ content: DISCORD_CSS });
    await expect.poll(() => drawn(page, "--control-primary-background-default")).toBe("rgb(233, 30, 99)");
    await expect.poll(() => drawn(page, "--nf-accent")).toBe("rgb(233, 30, 99)");
    expect(await stored(popup, "accentColor")).toBe("#e91e63");

    await themes(popup).getByRole("switch", { name: "Use my own accent color" }).uncheck();
    await expect.poll(() => drawn(page, "--control-primary-background-default")).toBe("rgb(88, 101, 242)");
    await expect.poll(() => drawn(page, "--nf-accent")).toBe("rgb(88, 101, 242)");

    // Turned on again, it brings back the color picked.
    await themes(popup).getByRole("switch", { name: "Use my own accent color" }).check();
    await expect(hex).toHaveValue("#e91e63");
    await expect.poll(() => drawn(page, "--control-primary-background-default")).toBe("rgb(233, 30, 99)");
  });

  test("a snippet applies as it is typed, and turning it off restores Discord's default", async ({ page }) => {
    await openDiscord(page);

    const chat = page.locator("#chat");

    await expect(chat).toHaveCSS("opacity", "1");
    await expect(themes(popup).getByText("No snippets yet.")).toBeVisible();
    await themes(popup).getByRole("button", { name: "New snippet" }).click();

    const name = themes(popup).getByRole("textbox", { name: "Name" });

    await expect(name).toBeFocused();
    await name.fill("Faded chat");
    await themes(popup).getByRole("textbox", { name: "CSS" }).fill("#chat { opacity: 0.5 !important; }");
    await expect(chat).toHaveCSS("opacity", "0.5");

    const toggle = themes(popup).getByRole("switch", { name: "Faded chat" });

    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(chat).toHaveCSS("opacity", "1");
    await expect(page.locator("style[data-nitfree-theme]")).toHaveCount(0);
    await toggle.check();
    await expect(chat).toHaveCSS("opacity", "0.5");

    // A second snippet is applied on its own, after the first.
    await themes(popup).getByRole("button", { name: "New snippet" }).click();
    await name.fill("Hidden chat");
    await themes(popup).getByRole("textbox", { name: "CSS" }).fill("#chat { visibility: hidden; }");
    await expect(chat).toHaveCSS("visibility", "hidden");
    await expect(chat).toHaveCSS("opacity", "0.5");

    // Deleting asks first, then takes its CSS out.
    await themes(popup).getByRole("button", { name: "Delete" }).click();
    await popup.getByRole("dialog").getByRole("button", { name: "Delete snippet" }).click();
    await expect(chat).toHaveCSS("visibility", "visible");
    await expect(themes(popup).getByRole("switch", { name: "Hidden chat" })).toHaveCount(0);
    await expect(chat).toHaveCSS("opacity", "0.5");

    // Discord tabs opened later get the snippets too.
    const other = await page.context().newPage();

    await openDiscord(other);
    await expect(other.locator("#chat")).toHaveCSS("opacity", "0.5");
  });

  test("the color theme, accent color and snippets travel with a backup's settings, adding to the snippets kept", async () => {
    await request(popup, "library:add", { file: png(32, 32), type: "emoji", title: "wave" });
    await themes(popup).getByRole("radio", { name: "Aurora" }).check();
    await themes(popup).getByRole("switch", { name: "Use my own accent color" }).check();
    await themes(popup).getByRole("textbox", { name: "Accent color" }).fill("#00ff88");
    await themes(popup).getByRole("textbox", { name: "Accent color" }).press("Enter");
    await themes(popup).getByRole("button", { name: "New snippet" }).click();
    await themes(popup).getByRole("textbox", { name: "Name" }).fill("Exported");
    await themes(popup).getByRole("textbox", { name: "CSS" }).fill("body { color: red; }");
    await expect.poll(async () => (await stored<TSnippet[]>(popup, "cssSnippets"))?.[0]?.css).toBe("body { color: red; }");

    await popup.getByRole("button", { name: "Back" }).click();
    await openPopupPage(popup, "Backup");
    await backup(popup).getByRole("checkbox", { name: "Include settings" }).check();

    const download = popup.waitForEvent("download");

    await backup(popup).getByRole("button", { name: "Export library" }).click();

    const file = path.join(os.tmpdir(), `nitfree-e2e-${Date.now()}-themes.nitfree`);

    await (await download).saveAs(file);

    // Meanwhile, the accent is turned off and another snippet made here.
    await popup.evaluate(async () => {
      const { chrome } = globalThis as unknown as { chrome: { storage: { local: { set: (items: object) => Promise<void> } } } };

      await chrome.storage.local.set({ colorTheme: null, accentColor: null, cssSnippets: [{ id: "local", name: "Local", css: "", enabled: false }] });
    });

    const chooser = popup.waitForEvent("filechooser");

    await backup(popup).getByRole("button", { name: "Import file" }).click();
    await (await chooser).setFiles(file);
    await expect(backup(popup).getByRole("checkbox", { name: "Also apply the settings in this file" })).toBeChecked();
    await backup(popup).getByRole("button", { name: "Import", exact: true }).click();
    await expect(backup(popup).getByRole("status")).toHaveText("Added 0, skipped 1 already in your library.");
    fs.rmSync(file);

    expect(await stored(popup, "colorTheme")).toBe("aurora");
    expect(await stored(popup, "accentColor")).toBe("#00ff88");
    expect((await stored<TSnippet[]>(popup, "cssSnippets"))?.map(snippet => snippet.name)).toEqual(["Local", "Exported"]);
  });
});
