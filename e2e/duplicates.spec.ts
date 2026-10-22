import type { Page } from "@playwright/test";

import { Buffer } from "node:buffer";

import { expect, test } from "./fixtures";
import { openPopup, openPopupPage, request } from "./helpers";
import { png } from "./images";



type TStoredItem = { id: string; title: string; tags: string[]; favorite: boolean; usageCount: number };

const duplicates = (page: Page) => page.getByRole("region", { name: "Duplicates" });
const addDialog = (page: Page) => page.getByRole("dialog", { name: "Add to Nitfree" });

function file(name: string, image: ReturnType<typeof png>): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: image.type, buffer: Buffer.from(image.data, "base64") };
}

async function add(page: Page, title: string, image: ReturnType<typeof png>, extra: Record<string, unknown> = {}): Promise<TStoredItem> {
  return (await request<TStoredItem>(page, "library:add", { file: image, type: "emoji", title, ...extra })).data!;
}

async function items(page: Page): Promise<TStoredItem[]> {
  return (await request<TStoredItem[]>(page, "library:list")).data!;
}

test.describe("duplicates", () => {
  let popup: Page;

  test.beforeEach(async ({ context, extensionId }) => {
    popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await openPopup(popup, extensionId);
  });

  test("adding a file already in the library, or twice at once, warns before saving a second copy", async () => {
    await add(popup, "loaf", png(64, 64));
    await popup.reload();
    await expect(popup.locator("dd[data-type=\"emoji\"]")).toHaveText("1");

    const chooser = popup.waitForEvent("filechooser");

    await popup.getByRole("button", { name: "Add Files" }).click();
    await (await chooser).setFiles([file("again.png", png(64, 64)), file("new.png", png(32, 32)), file("new-too.png", png(32, 32))]);

    const dialog = addDialog(popup);
    const drafts = dialog.getByRole("group");

    await expect(drafts).toHaveCount(3);
    await expect(drafts.nth(0)).toContainText("This file is already in your library as “loaf”. Saving it keeps a second copy.");
    await expect(drafts.nth(1)).not.toContainText("already");
    await expect(drafts.nth(2)).toContainText("This file is also listed above. Adding both keeps two copies.");

    // The warning does not stop saving, for when a second copy is wanted.
    await dialog.getByRole("button", { name: "Add 3 files" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await items(popup)).toHaveLength(4);
  });

  test("groups identical and near-identical items, and keeps the chosen one with the others' tags", async () => {
    const cats = (await request<{ id: string }>(popup, "tags:add", { name: "Cats" })).data!;

    await add(popup, "small", png(64, 64));
    await add(popup, "copy", png(64, 64), { tags: [cats.id], favorite: true });
    await add(popup, "big", png(128, 128));
    await add(popup, "wide", png(64, 32));
    await add(popup, "wide again", png(64, 32));
    await add(popup, "blue", png(64, 64, [0, 0, 255, 255]));
    await openPopupPage(popup, "Duplicates");

    // A resized copy matches; another shape or another color does not.
    const similar = duplicates(popup).getByRole("group", { name: "3 similar images" });
    const identical = duplicates(popup).getByRole("group", { name: "2 identical files" });

    await expect(similar.getByRole("radio")).toHaveCount(3);
    await expect(similar.getByRole("radio", { name: /big/ })).toBeChecked();
    await expect(identical.getByRole("radio")).toHaveCount(2);
    await expect(duplicates(popup).getByRole("radio", { name: /blue/ })).toHaveCount(0);

    // Cancelling keeps everything.
    const confirm = popup.getByRole("dialog", { name: "Keep “big”" });
    const keepSimilar = duplicates(popup).getByRole("button", { name: "Keep selected" }).first();

    await keepSimilar.click();
    await expect(confirm).toHaveAccessibleDescription(/^The 2 other items are deleted from your library for good/);
    await confirm.getByRole("button", { name: "Cancel" }).click();
    expect(await items(popup)).toHaveLength(6);

    await keepSimilar.click();
    await confirm.getByRole("button", { name: "Keep and delete others" }).click();
    await expect(duplicates(popup).getByRole("status")).toHaveText("Kept “big” and deleted 2 items.");
    await expect(similar).toHaveCount(0);

    const big = (await items(popup)).find(item => item.title === "big")!;

    expect(big).toMatchObject({ tags: [cats.id], favorite: true });

    // The one to keep can be another than the suggested one.
    await identical.getByText("wide again").click();
    await duplicates(popup).getByRole("button", { name: "Keep selected" }).click();
    await popup.getByRole("dialog", { name: "Keep “wide again”" }).getByRole("button", { name: "Keep and delete others" }).click();

    await expect(duplicates(popup).getByText("No duplicates in your library.")).toBeVisible();
    expect((await items(popup)).map(item => item.title).sort()).toEqual(["big", "blue", "wide again"]);
  });
});
