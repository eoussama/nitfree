import type { TArchiveSettings } from "~/lib/archive";
import type { TItem, TPack } from "~/lib/db";

import { toError, tryCatch } from "@eoussama/core";

import { ARCHIVE_EXTENSION, packsOf, tagsOf, writeArchive } from "~/lib/archive";
import { sendMessage } from "~/lib/messaging";
import { autocomplete, clickAction, playAnimations, sendSizes, shortcut, shortcutKeys, suggestionsAt } from "~/lib/settings";

import { download, exportName, safeFileName } from "./download";
import { library } from "./library.svelte";
import { showNotice } from "./notice.svelte";
import { archiveProblem } from "./problems";



export type TExportOptions = {

  /**
   * Whether the archive also holds the popup's settings.
   */
  withSettings?: boolean;

  /**
   * The packs to include. By default, the library's packs when exporting the library, else the packs
   * the items are in. A pack is exported on its own by passing just that pack, empty or not.
   */
  packs?: readonly TPack[];
  onProgress?: (done: number, total: number) => void;
};

async function readSettings(): Promise<TArchiveSettings> {
  const [sizes, action, play, suggest, at, useShortcut, keys] = await Promise.all([sendSizes.getValue(), clickAction.getValue(), playAnimations.getValue(), autocomplete.getValue(), suggestionsAt.getValue(), shortcut.getValue(), shortcutKeys.getValue()]);

  return { sendSizes: sizes, clickAction: action, playAnimations: play, autocomplete: suggest, suggestionsAt: at, shortcut: useShortcut, shortcutKeys: keys };
}

async function readFile(item: TItem): Promise<Uint8Array | null> {
  const file = await sendMessage("library:file", { id: item.id });

  return file ? new Uint8Array(await file.arrayBuffer()) : null;
}

/**
 * Packs items into a `.nitfree` archive. Exporting the library itself keeps every tag and pack, even
 * unused ones; exporting a part of it keeps only the tags and packs that part needs.
 *
 * @param items - The items to pack.
 * @param options - Settings, packs and progress reporting.
 * @returns The archive.
 */
export async function buildExport(items: readonly TItem[], options: TExportOptions = {}): Promise<Blob> {
  const bytes = await writeArchive({
    items,
    tags: items === library.items ? library.tags : tagsOf(items, library.tags),
    packs: options.packs ?? (items === library.items ? library.packs : packsOf(items, library.packs)),
    settings: options.withSettings ? await readSettings() : undefined,
    appVersion: browser.runtime.getManifest().version,
    readFile,
    onProgress: options.onProgress,
  });

  return new Blob([new Uint8Array(bytes)], { type: "application/zip" });
}

/**
 * The name an item's original file is saved under.
 *
 * @param item - The item.
 * @returns The title with the file's extension.
 */
export function fileNameOf(item: TItem): string {
  return `${safeFileName(item.title)}.${item.format === "jpeg" ? "jpg" : item.format}`;
}

/**
 * Saves one item's original file. Failures are shown as a notice.
 *
 * @param item - The item.
 * @returns Resolves once the download starts or the notice is shown.
 */
export async function saveItem(item: TItem): Promise<void> {
  const [error, file] = await tryCatch(sendMessage("library:file", { id: item.id }));

  if (error || !file) {
    showNotice(i18n.t("export.failed", { error: error ? toError(error).message : i18n.t("send.missing", { title: item.title }) }));

    return;
  }

  download(file, fileNameOf(item));
}

/**
 * Saves items as one `.nitfree` archive, with a notice for progress and for the outcome.
 *
 * @param items - The items to export.
 * @returns Resolves once the download starts or the notice is shown.
 */
export async function saveItems(items: readonly TItem[]): Promise<void> {
  if (!items.length) {
    return;
  }

  const [error, archive] = await tryCatch(buildExport(items, {
    onProgress: (done, total) => {
      if (total > 20) {
        showNotice(i18n.t("export.progress", { done: String(done), total: String(total) }));
      }
    },
  }));

  if (error) {
    showNotice(i18n.t("export.failed", { error: archiveProblem(error) }));

    return;
  }

  download(archive, exportName(ARCHIVE_EXTENSION));
  showNotice(i18n.t("export.done", { items: i18n.t("popup.items", items.length) }));
}
