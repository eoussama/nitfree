import type { TImportMode, TParsedArchive } from "~/lib/archive";
import type { TItem } from "~/lib/db";

import { tryCatch } from "@eoussama/core";

import { applyArchive, ARCHIVE_EXTENSION, ArchiveError, readArchive, readImages } from "~/lib/archive";
import { sendMessage } from "~/lib/messaging";
import { clickAction, fitSendSizes, playAnimations, sendSizes } from "~/lib/settings";

import { download, exportName } from "./download";
import { buildExport } from "./export";
import { library } from "./library.svelte";
import { archiveProblem } from "./problems";



export type TTransferResult
  = | { kind: "export"; count: number }
    | { kind: "import"; added: number; skipped: number; failed: number };

type TTransferState = {

  /**
   * What is running, or null when nothing is.
   */
  busy: "export" | "read" | "import" | null;
  done: number;
  total: number;

  /**
   * A file read and checked, waiting for the user to choose how to import it.
   */
  pending: { name: string; archive: TParsedArchive } | null;
  result: TTransferResult | null;
  error: string | null;
};

export const transfer: TTransferState = $state({ busy: null, done: 0, total: 0, pending: null, result: null, error: null });

function start(busy: NonNullable<TTransferState["busy"]>, total = 0): void {
  transfer.busy = busy;
  transfer.done = 0;
  transfer.total = total;
  transfer.result = null;
  transfer.error = null;
}

function fail(error: unknown): void {
  transfer.error = archiveProblem(error);
  transfer.busy = null;
}

/**
 * Packs items into a `.nitfree` archive and saves it.
 *
 * @param items - The items to export; the whole library when omitted.
 * @param withSettings - Whether the archive also holds the popup's settings.
 * @returns Whether the archive was saved.
 */
export async function exportItems(items: readonly TItem[] = library.items, withSettings = false): Promise<boolean> {
  start("export", items.length);

  const [error, archive] = await tryCatch(buildExport(items, {
    withSettings,
    onProgress: (done) => {
      transfer.done = done;
    },
  }));

  if (error) {
    fail(error);

    return false;
  }

  download(archive, exportName(ARCHIVE_EXTENSION));
  transfer.busy = null;
  transfer.result = { kind: "export", count: items.length };

  return true;
}

/**
 * Whether a file looks like something to import rather than an image to add.
 *
 * @param file - A picked or dropped file.
 * @returns True for a .nitfree backup or a zip.
 */
export function isArchiveFile(file: File): boolean {
  return /\.(?:nitfree|zip)$/i.test(file.name) || file.type === "application/zip";
}

/**
 * Reads and checks a file picked for import, holding it until {@link importPending} or {@link cancelImport}.
 *
 * @param file - The picked or dropped file.
 * @returns Resolves once the file is checked; the outcome is in the transfer state.
 */
export async function pickImport(file: File): Promise<void> {
  start("read");
  transfer.pending = null;

  const [error, archive] = await tryCatch(async () => readArchive(new Uint8Array(await file.arrayBuffer())));

  if (error) {
    fail(error instanceof ArchiveError ? error : new Error(i18n.t("archive.unreadableFile")));

    return;
  }

  transfer.busy = null;
  transfer.pending = { name: file.name, archive };
}

/**
 * Reads and checks a folder picked for import, holding it like {@link pickImport}. Subfolders
 * become tags on the images inside them; the picked folder itself is not a tag.
 *
 * @param files - The folder's files, as listed by a directory input.
 * @returns Resolves once the folder is checked; the outcome is in the transfer state.
 */
export async function pickFolder(files: readonly File[]): Promise<void> {
  start("read");
  transfer.pending = null;

  const [error, archive] = await tryCatch(async () => {
    const entries = await Promise.all(files.map(async (file) => {
      const [, ...path] = (file.webkitRelativePath || file.name).split("/");

      return [path.join("/") || file.name, new Uint8Array(await file.arrayBuffer())] as const;
    }));

    return readImages(Object.fromEntries(entries));
  });

  if (error) {
    fail(error instanceof ArchiveError ? error : new Error(i18n.t("archive.unreadableFolder")));

    return;
  }

  transfer.busy = null;
  transfer.pending = { name: files[0]?.webkitRelativePath.split("/")[0] ?? "", archive };
}

/**
 * Drops the file waiting to be imported.
 */
export function cancelImport(): void {
  transfer.pending = null;
  transfer.error = null;
}

/**
 * Imports the file waiting to be imported. The file was fully checked when it was picked.
 * Merging adds what the library does not have yet; replacing empties the library first.
 *
 * @param mode - Merge into the library or replace it.
 * @param withSettings - Whether to also apply the settings the archive holds.
 * @returns Resolves once done; the outcome is in the transfer state.
 */
export async function importPending(mode: TImportMode, withSettings: boolean): Promise<void> {
  const pending = transfer.pending;

  if (!pending) {
    return;
  }

  const { archive } = pending;

  start("import", archive.entries.length);

  const [error, result] = await tryCatch(async () => {
    const counts = await applyArchive(archive, mode, {
      clear: () => sendMessage("library:clear"),
      ensureTag: tag => sendMessage("tags:ensure", tag),
      importItem: (item, skipDuplicates) => sendMessage("library:import", { item, skipDuplicates }),
    }, (done) => {
      transfer.done = done;
    });

    if (withSettings && archive.settings) {
      await Promise.all([
        // Brought within range, as the popup does with a typed size: the file may come from anywhere.
        sendSizes.setValue(fitSendSizes(archive.settings.sendSizes)),
        clickAction.setValue(archive.settings.clickAction),
        playAnimations.setValue(archive.settings.playAnimations),
      ]);
    }

    return counts;
  });

  if (error) {
    fail(error);

    return;
  }

  transfer.busy = null;
  transfer.pending = null;
  transfer.result = { kind: "import", ...result };
}
