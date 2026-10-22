import type { TParsedArchive } from "~/lib/archive";
import type { TItem } from "~/lib/db";

import { toError, tryCatch } from "@eoussama/core";

import { ARCHIVE_EXTENSION, ArchiveError, readArchive } from "~/lib/archive";
import { sendMessage } from "~/lib/messaging";
import { clickAction, playAnimations, sendSizes } from "~/lib/settings";

import { download, exportName } from "./download";
import { buildExport } from "./export";
import { library } from "./library.svelte";



export type TImportMode = "merge" | "replace";

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
  transfer.error = toError(error).message;
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
    fail(error instanceof ArchiveError ? error : new Error("This file could not be read"));

    return;
  }

  transfer.busy = null;
  transfer.pending = { name: file.name, archive };
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
    if (mode === "replace") {
      await sendMessage("library:clear");
    }

    const tagIds: Record<string, string> = Object.create(null) as Record<string, string>;

    for (const tag of archive.tags) {
      const { id } = await sendMessage("tags:ensure", { name: tag.name, color: tag.color });

      tagIds[tag.name] = id;
    }

    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of archive.entries) {
      const [itemError, item] = await tryCatch(sendMessage("library:import", {
        skipDuplicates: mode === "merge",
        item: {
          id: entry.id ?? undefined,
          file: new Blob([entry.bytes]),
          type: entry.type,
          title: entry.title,
          description: entry.description,
          tags: entry.tags.map(name => tagIds[name]).filter((id): id is string => id !== undefined),
          favorite: entry.favorite,
          createdAt: entry.createdAt ?? undefined,
          updatedAt: entry.updatedAt ?? undefined,
          usedAt: entry.usedAt,
          usageCount: entry.usageCount,
        },
      }));

      if (itemError) {
        failed++;
      }
      else if (item) {
        added++;
      }
      else {
        skipped++;
      }

      transfer.done++;
    }

    if (withSettings && archive.settings) {
      await Promise.all([
        sendSizes.setValue(archive.settings.sendSizes),
        clickAction.setValue(archive.settings.clickAction),
        playAnimations.setValue(archive.settings.playAnimations),
      ]);
    }

    return { added, skipped, failed };
  });

  if (error) {
    fail(error);

    return;
  }

  transfer.busy = null;
  transfer.pending = null;
  transfer.result = { kind: "import", ...result };
}
