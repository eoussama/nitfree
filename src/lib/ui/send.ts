import type { TItem } from "~/lib/db";

import { draftAttachmentIds, findMessageBox, findUploadInput } from "~/lib/discord";
import { resizeImage } from "~/lib/media/resize";
import { sendMessage } from "~/lib/messaging";
import { sendSizes } from "~/lib/settings";



/**
 * The largest file Discord takes from accounts without Nitro.
 */
export const UPLOAD_LIMIT = 10 * 1024 * 1024;

/**
 * How long to wait for Discord to list an attached file before sending.
 */
const ATTACH_TIMEOUT = 10_000;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

/**
 * A failure to show the user as it is, already worded for them.
 */
export class SendError extends Error {}

/**
 * The name a sent file gets: the item's title, with characters file systems refuse replaced.
 *
 * @param title - The item's title.
 * @param mime - The file's type.
 * @returns The file name.
 */
export function fileName(title: string, mime: string): string {
  return `${title.replace(/[\\/:*?"<>|]+/g, "_") || "nitfree"}.${EXTENSIONS[mime] ?? "png"}`;
}

/**
 * The longest side an item is sent at: emojis and stickers are sized like Discord's own, GIFs and
 * images go as they are.
 *
 * @param item - The item.
 * @returns The size in pixels, or null to send the original.
 */
async function sendSize(item: TItem): Promise<number | null> {
  const sizes = await sendSizes.getValue();

  return item.type === "emoji" ? sizes.emoji : item.type === "sticker" ? sizes.sticker : null;
}

/**
 * The file to send for an item, made at its sending size once and then read from the library's cache.
 *
 * @param item - The item.
 * @returns The file, named after the item.
 */
export async function prepareFile(item: TItem): Promise<File> {
  const size = await sendSize(item);

  // What goes as it is can be refused before it is read.
  if (size === null && item.size > UPLOAD_LIMIT) {
    throw new SendError(i18n.t("send.tooLarge", { title: item.title }));
  }

  const key = size === null ? null : `${item.type}-${size}`;
  let file = key ? await sendMessage("library:variant", { id: item.id, key }) : null;

  if (!file) {
    const original = await sendMessage("library:file", { id: item.id });

    if (!original) {
      throw new SendError(i18n.t("send.missing", { title: item.title }));
    }

    file = size === null ? original : await resizeImage(original, item, size);

    if (key && file !== original) {
      void sendMessage("library:storeVariant", { id: item.id, key, file }).catch(() => undefined);
    }
  }

  if (file.size > UPLOAD_LIMIT) {
    throw new SendError(i18n.t("send.tooLarge", { title: item.title }));
  }

  return new File([file], fileName(item.title, file.type), { type: file.type });
}

function waitFor(composer: Element, ready: () => boolean): Promise<boolean> {
  if (ready()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (ready()) {
        done(true);
      }
    });
    const timer = setTimeout(done, ATTACH_TIMEOUT, false);

    function done(result: boolean): void {
      // Stryker disable next-line CallExpression: a promise settles once, so a later call changes nothing seen.
      observer.disconnect();
      // Stryker disable next-line CallExpression: as above.
      clearTimeout(timer);
      resolve(result);
    }

    observer.observe(composer, { childList: true, subtree: true });
  });
}

/**
 * Adds a file to a composer's message, the way Discord's upload button does, and sends the message
 * when asked to, the way Enter does. Whatever the message already holds goes with it.
 *
 * @param composer - The composer.
 * @param file - The file.
 * @param options - What to do.
 * @param options.send - Whether to send the message once the file is in.
 * @param options.title - The item's title, for messages.
 * @returns Resolves once Discord lists the file, and has been asked to send.
 */
export async function attachFile(composer: Element, file: File, { send, title }: { send: boolean; title: string }): Promise<void> {
  const input = findUploadInput(composer);
  const box = findMessageBox(composer);

  if (!input || !box) {
    throw new SendError(i18n.t("send.noComposer"));
  }

  // The file is in once an attachment Discord did not list before shows up.
  const before = new Set(draftAttachmentIds(composer));
  const transfer = new DataTransfer();

  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));

  if (!(await waitFor(composer, () => draftAttachmentIds(composer).some(id => !before.has(id))))) {
    throw new SendError(i18n.t("send.notAttached", { title }));
  }

  if (send) {
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }
}
