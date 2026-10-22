import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, request } from "./helpers";
import { png } from "./images";



type TListed = { id: string; title: string; favorite: boolean };

const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const tile = (page: Page, title: string) => panel(page).getByRole("region", { name: "All files" }).locator(`[data-tile][aria-label="${title}"]`);
const actionBar = (page: Page) => page.locator("[data-action-bar]");
const detailsDialog = (page: Page) => page.getByRole("dialog", { name: ":wave:" });
const lightbox = (page: Page) => page.getByRole("dialog", { name: "wave", exact: true });

// Each field's label and value, as the dialog lists them.
async function fields(page: Page): Promise<Record<string, string>> {
  return detailsDialog(page).locator("dl > div").evaluateAll(rows => Object.fromEntries(rows.map(row => [row.querySelector("dt")!.textContent!.trim(), row.querySelector("dd")!.textContent!.replace(/\s+/g, " ").trim()])));
}

async function imageWidth(page: Page): Promise<number> {
  return lightbox(page).locator("img").evaluate(image => image.getBoundingClientRect().width);
}

test.describe("details", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId, page }) => {
    popup = await context.newPage();
    await openPopup(popup, extensionId);

    const party = (await request<{ id: string }>(popup, "tags:add", { name: "party" })).data!;

    await request(popup, "library:add", { file: png(64, 48), type: "emoji", title: "wave", description: "Hello there", tags: [party.id] });
    await openDiscord(page);
    await page.getByRole("button", { name: "Open Nitfree" }).click();
    await expect(panel(page)).toBeVisible();
  });

  test("Details on the hover bar shows everything about an item, read only, and favorites and downloads it", async ({ page }) => {
    await tile(page, "wave").hover();
    await actionBar(page).getByRole("button", { name: "Details" }).click();

    const dialog = detailsDialog(page);

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Edit" })).toBeFocused();
    expect(await fields(page)).toMatchObject({
      Type: "Emoji",
      Tags: "party",
      Description: "Hello there",
      File: expect.stringMatching(/^PNG · 64 × 48 · \d+ bytes$/),
      Sent: "Never sent",
    });
    await expect(dialog.getByRole("textbox")).toHaveCount(0);

    // Favorite follows the library at once.
    await dialog.getByRole("button", { name: "Add to Favorites" }).click();
    await expect(dialog.getByRole("button", { name: "Remove from Favorites" })).toHaveAttribute("aria-pressed", "true");
    expect((await request<TListed[]>(popup, "library:list")).data![0]!.favorite).toBe(true);

    const download = page.waitForEvent("download");

    await dialog.getByRole("button", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toBe("wave.png");

    // Escape closes it, and focus goes back to the tile.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    await expect(tile(page, "wave")).toBeFocused();
  });

  test("the preview shows larger, zooms, and closes before the details do", async ({ page }) => {
    await tile(page, "wave").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Details" }).click();
    await detailsDialog(page).getByRole("button", { name: "View larger" }).click();

    const view = lightbox(page);

    await expect(view).toBeVisible();
    await expect(view.getByRole("button", { name: "Close" })).toBeFocused();
    await expect(view.getByRole("button", { name: "Fit to window" })).toHaveText("100%");

    // Never larger than the file when fitted, then in steps.
    expect(await imageWidth(page)).toBe(64);
    await view.getByRole("button", { name: "Zoom in" }).click();
    await expect(view.getByRole("button", { name: "Fit to window" })).toHaveText("150%");
    expect(await imageWidth(page)).toBe(96);
    await page.keyboard.press("+");
    await expect(view.getByRole("button", { name: "Fit to window" })).toHaveText("200%");
    await view.locator("img").click();
    await expect(view.getByRole("button", { name: "Fit to window" })).toHaveText("300%");
    await page.keyboard.press("0");
    await expect(view.getByRole("button", { name: "Fit to window" })).toHaveText("100%");
    await expect(view.getByRole("button", { name: "Zoom out" })).toBeDisabled();

    // Escape closes the larger preview only.
    await page.keyboard.press("Escape");
    await expect(view).toHaveCount(0);
    await expect(detailsDialog(page)).toBeVisible();
    await expect(detailsDialog(page).getByRole("button", { name: "View larger" })).toBeFocused();

    // A click beside the image closes it too.
    await detailsDialog(page).getByRole("button", { name: "View larger" }).click();
    await view.click({ position: { x: 10, y: 300 } });
    await expect(view).toHaveCount(0);
  });

  test("Edit swaps the details for the edit dialog", async ({ page }) => {
    await tile(page, "wave").hover();
    await actionBar(page).getByRole("button", { name: "Details" }).click();
    await detailsDialog(page).getByRole("button", { name: "Edit" }).click();

    const edit = page.getByRole("dialog", { name: "Edit item" });

    await expect(detailsDialog(page)).toHaveCount(0);
    await expect(edit.getByRole("textbox", { name: "Name" })).toHaveValue("wave");

    await page.keyboard.press("Escape");
    await expect(edit).toHaveCount(0);
    await expect(tile(page, "wave")).toBeFocused();
  });
});
