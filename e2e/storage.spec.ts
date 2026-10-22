import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { openPopup, request } from "./helpers";
import { gif, png } from "./images";



type TStoredItem = { id: string; title: string };

const storage = (page: Page) => page.getByRole("region", { name: "Storage" });
const largest = (page: Page) => storage(page).getByRole("list", { name: "Largest items" });
const SIZE = /^[\d.,]+\s?(bytes|kB|MB|GB)$/;

async function items(page: Page): Promise<TStoredItem[]> {
  return (await request<TStoredItem[]>(page, "library:list")).data!;
}

test.describe("storage", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await openPopup(popup, extensionId);
  });

  test("shows the space used by type and in total, and clearing the cache keeps every original", async () => {
    const sticker = (await request<TStoredItem>(popup, "library:add", { file: png(256, 256), type: "sticker", title: "loaf" })).data!;
    const emoji = (await request<TStoredItem>(popup, "library:add", { file: gif(64, 64, [[255, 0, 0, 255], [0, 0, 255, 255]], 100), type: "emoji", title: "party" })).data!;

    await request(popup, "library:storeVariant", { id: sticker.id, key: "sticker-160", file: png(160, 160) });
    await request(popup, "library:storeVariant", { id: emoji.id, key: "emoji-48", file: png(48, 48) });
    await popup.reload();

    await expect(storage(popup).getByText(/used of .* available$/)).toBeVisible();
    await expect(storage(popup).locator("dd[data-type=\"sticker\"]")).toHaveText(SIZE);
    await expect(storage(popup).locator("dd[data-type=\"emoji\"]")).toHaveText(SIZE);
    await expect(storage(popup).locator("dd[data-type=\"image\"]")).toHaveText(/^0\s?bytes?$/);

    const cached = storage(popup).locator("dd[data-type=\"cache\"]");

    await expect(cached).not.toHaveText(/^0\s?bytes?$/);
    await storage(popup).getByRole("button", { name: "Clear cache" }).click();

    await expect(storage(popup).getByRole("status")).toHaveText(/^Freed [\d.,]+\s?(bytes|kB|MB|GB)\.$/);
    await expect(cached).toHaveText(/^0\s?bytes?$/);
    await expect(storage(popup).getByRole("button", { name: "Clear cache" })).toBeDisabled();
    expect((await request(popup, "library:cacheUsage")).data).toEqual({ size: 0, count: 0 });

    // Nothing else is gone.
    expect(await items(popup)).toHaveLength(2);
    expect((await request(popup, "library:file", { id: sticker.id })).data).toMatchObject({ $nf: "blob", type: "image/png" });
    expect((await request(popup, "library:file", { id: emoji.id })).data).toMatchObject({ $nf: "blob", type: "image/gif" });
    expect((await request(popup, "library:variant", { id: sticker.id, key: "sticker-160" })).data).toBeNull();
  });

  test("lists the largest items first, and deletes the selected ones once confirmed", async () => {
    await request(popup, "library:add", { file: png(16, 16), type: "emoji", title: "small" });
    await request(popup, "library:add", { file: png(512, 512), type: "image", title: "big" });
    await request(popup, "library:add", { file: png(128, 128), type: "sticker", title: "medium" });

    await expect(largest(popup).getByRole("checkbox")).toHaveCount(3);
    await expect(largest(popup).locator(".title")).toHaveText(["big", "medium", "small"]);

    const remove = storage(popup).getByRole("button", { name: /^Delete \d+ items?$/ });

    await expect(remove).toBeDisabled();
    await largest(popup).getByRole("checkbox", { name: /big/ }).check();
    await largest(popup).getByRole("checkbox", { name: /medium/ }).check();
    await expect(remove).toHaveText("Delete 2 items");

    // Cancelling keeps everything.
    await remove.click();
    await expect(storage(popup).getByText("Delete 2 items for good? This cannot be undone.")).toBeVisible();
    await storage(popup).getByRole("button", { name: "Cancel" }).click();
    expect(await items(popup)).toHaveLength(3);

    await remove.click();
    await storage(popup).getByRole("button", { name: "Delete", exact: true }).click();

    await expect(storage(popup).getByRole("status")).toHaveText("Deleted 2 items.");
    await expect(largest(popup).locator(".title")).toHaveText(["small"]);
    expect((await items(popup)).map(item => item.title)).toEqual(["small"]);
    await expect(storage(popup).getByRole("button", { name: "Delete 0 items" })).toBeDisabled();
  });

  test("asks the browser to keep the library, and says whether it will", async () => {
    const kept = storage(popup).getByText("The browser will keep your library, even when the disk runs low on space.");
    const button = storage(popup).getByRole("button", { name: "Keep my library safe" });

    await expect(kept.or(button)).toBeVisible();

    if (await button.isVisible()) {
      await button.click();
      await expect(kept.or(storage(popup).getByRole("alert"))).toBeVisible();
    }
  });
});
