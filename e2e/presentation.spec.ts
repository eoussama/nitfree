import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openDiscord, openPopup, request } from "./helpers";
import { gif, png } from "./images";



const panel = (page: Page) => page.getByRole("dialog", { name: "Nitfree library" });
const tile = (page: Page, title: string) => panel(page).getByRole("region", { name: "All files" }).locator(`[data-tile][aria-label="${title}"]`);
const tooltip = (page: Page) => page.getByRole("tooltip");
const toolbar = (page: Page) => page.getByRole("toolbar");

/**
 * How many frames the image shown in an element has, read back from its source.
 *
 * @param page - The Discord page.
 * @param selector - Where the image is: a tile or the inspector.
 * @returns The frame count, or 0 when no image shows.
 */
async function framesShown(page: Page, selector: string): Promise<number> {
  return panel(page).locator(selector).first().evaluate(async (element) => {
    const image = element.querySelector("img");

    if (!image?.src) {
      return 0;
    }

    const blob = await (await fetch(image.src)).blob();
    const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type });

    await decoder.tracks.ready;

    const count = decoder.tracks.selectedTrack?.frameCount ?? 1;

    decoder.close();

    return count;
  });
}

async function openPanel(page: Page): Promise<void> {
  await openDiscord(page);
  await page.getByRole("button", { name: "Open Nitfree" }).click();
  await expect(panel(page)).toBeVisible();
}

test.describe("presentation", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await openPopup(popup, extensionId);
  });

  test("an empty library invites to add files", async ({ page }) => {
    await openPanel(page);

    await expect(panel(page).getByText("Add images from your computer, or drop or paste them here.")).toBeVisible();

    const chooser = page.waitForEvent("filechooser");

    await panel(page).locator(".body").getByRole("button", { name: "Add Files" }).click();
    expect(await chooser).toBeTruthy();
  });

  test("the sidebar's tooltips look and sit like Discord's", async ({ page }) => {
    await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: "wave" });
    await openPanel(page);

    const category = panel(page).getByRole("navigation").getByRole("button", { name: "All files" });

    await expect(category).not.toHaveAttribute("title");
    await category.hover();
    await expect(tooltip(page)).toHaveText("All files");

    // To the right of the icon, vertically centered on it.
    const anchor = (await category.boundingBox())!;
    const box = (await tooltip(page).boundingBox())!;

    expect(box.x).toBeGreaterThan(anchor.x + anchor.width);
    expect(Math.abs(box.y + box.height / 2 - (anchor.y + anchor.height / 2))).toBeLessThanOrEqual(1);
    expect(await tooltip(page).evaluate(element => getComputedStyle(element).borderRadius)).toBe("8px");

    await page.mouse.move(0, 0);
    await expect(tooltip(page)).toHaveCount(0);
  });

  test("a hovered item gets Discord's hover bar to favorite, edit or delete it", async ({ page }) => {
    await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: "wave" });
    await openPanel(page);

    await tile(page, "wave").hover();
    await expect(toolbar(page).getByRole("button")).toHaveCount(3);

    // The bar floats a little above the tile, its buttons apart.
    const cell = (await tile(page, "wave").boundingBox())!;
    const bar = (await toolbar(page).boundingBox())!;
    const [first, second] = await Promise.all([0, 1].map(async index => (await toolbar(page).getByRole("button").nth(index).boundingBox())!));

    expect(cell.y - (bar.y + bar.height)).toBeGreaterThanOrEqual(4);
    expect(cell.y - (bar.y + bar.height)).toBeLessThanOrEqual(8);
    expect(second!.x - (first!.x + first!.width)).toBeGreaterThanOrEqual(2);
    expect(first!.width).toBeGreaterThanOrEqual(28);

    // Its tooltips sit centered above each button.
    const favorite = toolbar(page).getByRole("button", { name: "Add to Favorites" });

    await favorite.hover();
    await expect(tooltip(page)).toHaveText("Add to Favorites");

    const button = (await favorite.boundingBox())!;
    const tip = (await tooltip(page).boundingBox())!;

    expect(Math.abs(tip.x + tip.width / 2 - (button.x + button.width / 2))).toBeLessThanOrEqual(1);
    expect(tip.y + tip.height).toBeLessThan(button.y);

    // Clicking it leaves focus where it was.
    await panel(page).getByRole("searchbox", { name: "Search Nitfree" }).focus();
    await favorite.click();
    await expect(panel(page).getByRole("searchbox", { name: "Search Nitfree" })).toBeFocused();
    await expect(panel(page).getByRole("region", { name: "Favorites" }).locator("[data-tile]")).toHaveCount(1);
    // The new Favorites row moved the tile from under the pointer; hovered again, the bar has turned.
    await tile(page, "wave").hover();
    await expect(toolbar(page).getByRole("button", { name: "Remove from Favorites" })).toBeVisible();

    await toolbar(page).getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("dialog", { name: "Edit item" })).toBeVisible();
    await page.keyboard.press("Escape");

    await tile(page, "wave").hover();
    await toolbar(page).getByRole("button", { name: "Delete" }).click();
    await expect(tile(page, "wave")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText(/Deleted “wave”/);

    await page.mouse.move(0, 0);
    await expect(toolbar(page)).toHaveCount(0);
  });

  test("the hover bar goes away when a search moves the tiles under the pointer", async ({ page }) => {
    for (const title of ["alpha", "beta", "gamma"]) {
      await request(popup, "library:add", { file: png(64, 64), type: "emoji", title });
    }

    await openPanel(page);
    await tile(page, "gamma").hover();
    await expect(toolbar(page)).toBeVisible();

    // Gamma stays, but moves to the front.
    await panel(page).getByRole("searchbox", { name: "Search Nitfree" }).fill("gamma");
    await expect(toolbar(page)).toHaveCount(0);

    // Hovered again, through the space it left, it sits on the tile where it now is.
    await panel(page).locator(".body").hover({ position: { x: 300, y: 200 } });
    await tile(page, "gamma").hover();

    const cell = (await tile(page, "gamma").boundingBox())!;
    const bar = (await toolbar(page).boundingBox())!;

    // Just above it; in the first column, kept inside the panel.
    expect(bar.y + bar.height).toBeLessThan(cell.y);
    expect(cell.y - (bar.y + bar.height)).toBeLessThanOrEqual(8);
    expect(bar.x).toBeLessThan(cell.x + cell.width);
    expect(bar.x + bar.width).toBeGreaterThan(cell.x);
  });

  test("the hover bar goes with the pointer, and stays on the way up to it", async ({ page }) => {
    for (let i = 0; i < 20; i++) {
      await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: `blob_${String(i).padStart(2, "0")}` });
    }

    await openPanel(page);

    // A tile in the second row, so the way up to the bar crosses where the first row is.
    const target = tile(page, "blob_10");

    await target.hover();
    await expect(toolbar(page)).toBeVisible();

    const cell = (await target.boundingBox())!;
    const bar = (await toolbar(page).boundingBox())!;

    // Straight up from the tile, over the gap, into the bar.
    await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2);
    await page.mouse.move(cell.x + cell.width / 2, bar.y + bar.height / 2, { steps: 12 });
    await expect(toolbar(page)).toBeVisible();
    await expect(toolbar(page)).toHaveAttribute("aria-label", "blob_10");

    // Off the bar and the tile, onto an empty spot of the grid, it goes.
    await panel(page).locator(".body").hover({ position: { x: 300, y: 300 } });
    await expect(toolbar(page)).toHaveCount(0);

    // Off the tile straight onto empty grid, too.
    await target.hover();
    await expect(toolbar(page)).toBeVisible();
    await panel(page).locator(".body").hover({ position: { x: 300, y: 300 } });
    await expect(toolbar(page)).toHaveCount(0);
  });

  test("animated items play only while hovered or focused", async ({ page }) => {
    await request(popup, "library:add", { file: gif(128, 128, [[255, 0, 0, 255], [0, 0, 255, 255]], 100), type: "emoji", title: "party" });
    await request(popup, "library:add", { file: png(128, 128), type: "emoji", title: "still" });
    await openPanel(page);

    const party = "[data-tile][aria-label=\"party\"]";

    await expect.poll(() => framesShown(page, party)).toBe(1);

    await tile(page, "party").hover();
    await expect.poll(() => framesShown(page, party)).toBe(2);
    await expect.poll(() => framesShown(page, "[data-inspector]")).toBe(2);

    await tile(page, "still").hover();
    await expect.poll(() => framesShown(page, party)).toBe(1);

    // The inspector keeps naming the last item hovered, still once the pointer has left.
    await tile(page, "party").hover();
    await expect.poll(() => framesShown(page, "[data-inspector]")).toBe(2);
    await page.mouse.move(0, 0);
    await expect(panel(page).locator("[data-inspector]")).toContainText(":party:");
    await expect.poll(() => framesShown(page, "[data-inspector]")).toBe(1);

    await tile(page, "party").focus();
    await expect.poll(() => framesShown(page, party)).toBe(2);
  });

  test("tiles lift on hover, unless Discord asks for reduced motion", async ({ page }) => {
    await request(popup, "library:add", { file: png(64, 64), type: "emoji", title: "wave" });
    await openPanel(page);

    const image = tile(page, "wave").locator("img");

    await tile(page, "wave").hover();
    await expect.poll(() => image.evaluate(element => getComputedStyle(element).transform)).not.toBe("none");

    await page.evaluate(() => {
      document.documentElement.dataset.nfReducedMotion = "true";
    });
    await expect.poll(() => image.evaluate(element => getComputedStyle(element).transform)).toBe("none");
  });
});

test.describe("a library of a thousand items", () => {
  test.setTimeout(180_000);

  test("loads only what shows, and scrolls smoothly", async ({ context, page, extensionId }) => {
    const popup = await context.newPage();

    await openPopup(popup, extensionId);

    // Small enough to show as they are, so every image that loads is one the panel asked for.
    for (let i = 0; i < 1000; i++) {
      await request(popup, "library:add", { file: png(64, 64, [i % 256, (i * 7) % 256, (i * 13) % 256, 255]), type: "emoji", title: `item_${String(i).padStart(4, "0")}` });
    }

    await openPanel(page);
    await expect(panel(page).locator("[data-tile]")).toHaveCount(1000);

    // Only the tiles on screen fetch their image, even given time.
    await expect.poll(() => panel(page).locator("[data-tile] img").count()).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    expect(await panel(page).locator("[data-tile] img").count()).toBeLessThan(150);

    // Scroll to the end a step per frame, timing each frame against idle frames on the same machine.
    const { idle, scrolling } = await panel(page).locator(".body").evaluate(async (body) => {
      const median = (values: number[]): number => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

      async function time(step: () => boolean): Promise<number> {
        const durations: number[] = [];
        let last = performance.now();

        while (step()) {
          await new Promise(resolve => requestAnimationFrame(resolve));

          const now = performance.now();

          durations.push(now - last);
          last = now;
        }

        return median(durations);
      }

      let frames = 0;
      const idle = await time(() => frames++ < 30);
      const scrolling = await time(() => {
        body.scrollTop += 120;

        return body.scrollTop + body.clientHeight < body.scrollHeight - 1;
      });

      return { idle, scrolling };
    });

    test.info().annotations.push({ type: "frames", description: `idle ${idle.toFixed(1)} ms, scrolling ${scrolling.toFixed(1)} ms` });
    // Scrolling costs little more than an idle frame.
    expect(scrolling).toBeLessThan(idle * 1.5 + 4);

    // The last tiles show their image once reached.
    await expect(tile(page, "item_0999").locator("img")).toBeVisible();
  });
});
