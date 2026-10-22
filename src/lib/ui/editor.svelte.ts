import type { TItem, TItemType } from "~/lib/db";
import type { TImageInfo } from "~/lib/media";

import { toError, tryCatch } from "@eoussama/core";

import { hashBytes } from "~/lib/db/library";
import { inspectImage } from "~/lib/media";
import { sendMessage } from "~/lib/messaging";

import { guessItemType, isAcceptedFile, resolveTagNames, titleFromFileName } from "./drafts";
import { library } from "./library.svelte";
import { thumbnail } from "./thumbnails";



/**
 * One file being added, or the item being edited, with the details the user can change.
 */
export type TDraft = {
  key: number;
  file: File | null;
  url: string | null;
  ownsUrl: boolean;
  info: TImageInfo | null;
  // The file's content hash, to warn when it is already in the library; null for the item being edited.
  hash: string | null;
  error: string | null;
  title: string;
  type: TItemType;
  description: string;
  tags: string[];
};

type TEditorState = {
  mode: "add" | "edit" | null;
  item: TItem | null;
  drafts: TDraft[];
  saving: boolean;
  // Files still being read for the open dialog; it cannot save until they are in.
  reading: number;
  error: string | null;
};

/**
 * The add and edit dialog's state. The dialog itself lives in the page overlay.
 */
export const editor: TEditorState = $state({ mode: null, item: null, drafts: [], saving: false, reading: 0, error: null });

let nextKey = 0;
// Bumped whenever the dialog opens or closes, so a save that outlives its dialog changes nothing.
let session = 0;
// Bumped by each request to open the add dialog, so only the latest files picked, dropped or pasted open it.
let ticket = 0;
// What had focus before the dialog opened, focused again when it closes.
let returnFocus: HTMLElement | null = null;

async function readFile(file: File): Promise<Pick<TDraft, "info" | "hash" | "error" | "url" | "ownsUrl">> {
  if (!isAcceptedFile(file) && !file.type.startsWith("image/")) {
    return { info: null, hash: null, error: i18n.t("editor.unsupported"), url: null, ownsUrl: false };
  }

  // A file moved or changed since it was picked cannot be read any more.
  const [error, bytes] = await tryCatch(file.arrayBuffer());

  if (error) {
    return { info: null, hash: null, error: i18n.t("editor.unreadable"), url: null, ownsUrl: false };
  }

  const info = inspectImage(new Uint8Array(bytes));

  return {
    info,
    hash: info ? await hashBytes(new Uint8Array(bytes)) : null,
    error: info ? null : i18n.t("editor.unsupported"),
    url: info ? URL.createObjectURL(file) : null,
    ownsUrl: info !== null,
  };
}

function release(drafts: readonly TDraft[]): void {
  for (const draft of drafts) {
    if (draft.ownsUrl && draft.url) {
      URL.revokeObjectURL(draft.url);
    }
  }
}

/**
 * The focused element, looking inside shadow roots such as the panel's.
 *
 * @returns The element, or null when nothing is focused.
 */
export function focusedElement(): HTMLElement | null {
  let active = document.activeElement;

  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  return active instanceof HTMLElement && active !== document.body ? active : null;
}

function open(mode: "add" | "edit", item: TItem | null, drafts: TDraft[], focus: HTMLElement | null): void {
  release(editor.drafts);
  session++;
  returnFocus = focus;
  editor.mode = mode;
  editor.item = item;
  editor.drafts = drafts;
  editor.error = null;
  editor.saving = false;
  editor.reading = 0;
}

function clear(): void {
  release(editor.drafts);
  session++;
  returnFocus = null;
  editor.mode = null;
  editor.item = null;
  editor.drafts = [];
  editor.error = null;
  editor.saving = false;
  editor.reading = 0;
}

/**
 * Whether a draft can be saved: its file is an image Nitfree can read. A draft that failed to save
 * stays usable, so saving again retries it.
 *
 * @param draft - A draft in the dialog.
 * @returns Whether to save it.
 */
export function isUsable(draft: TDraft): boolean {
  return draft.info !== null;
}

/**
 * Warns when a draft's file is already in the library, or listed earlier in the dialog, so saving it
 * would keep a second copy.
 *
 * @param draft - A draft in the dialog.
 * @returns The warning, or null.
 */
export function duplicateWarning(draft: TDraft): string | null {
  if (!draft.hash) {
    return null;
  }

  const item = library.items.find(found => found.hash === draft.hash && found.id !== editor.item?.id);

  if (item) {
    return i18n.t("editor.duplicate", { title: item.title });
  }

  const index = editor.drafts.findIndex(found => found.key === draft.key);

  return editor.drafts.slice(0, index).some(found => found.hash === draft.hash) ? i18n.t("editor.duplicateDraft") : null;
}

async function readDrafts(files: readonly File[]): Promise<TDraft[]> {
  return Promise.all(files.map(async (file): Promise<TDraft> => {
    const read = await readFile(file);

    return {
      key: nextKey++,
      file,
      ...read,
      title: titleFromFileName(file.name),
      type: guessItemType(read.info),
      description: "",
      tags: [],
    };
  }));
}

/**
 * Opens the dialog to add files: picked, dropped or pasted. Titles come from the file names and the
 * type is guessed from each image; files Nitfree cannot use are listed with the reason. Files added
 * while the add dialog is open join it.
 *
 * @param files - The files to add.
 * @param focus - What to focus when the dialog closes; by default, what has focus now.
 * @returns Once the dialog shows the files.
 */
export async function startAdd(files: Iterable<File>, focus: HTMLElement | null = focusedElement()): Promise<void> {
  const list = [...files];

  if (!list.length || editor.saving || editor.mode === "edit") {
    return;
  }

  // Joining the open add dialog: the files count only if that dialog is still open once they are read.
  if (editor.mode === "add") {
    const current = session;

    editor.reading++;

    const drafts = await readDrafts(list);

    if (current !== session) {
      release(drafts);

      return;
    }

    editor.reading--;
    editor.drafts = [...editor.drafts, ...drafts];

    return;
  }

  // Opening the dialog: only the latest request does, and only if no dialog opened meanwhile.
  const mine = ++ticket;
  const drafts = await readDrafts(list);

  if (mine !== ticket || editor.mode) {
    release(drafts);

    return;
  }

  open("add", null, drafts, focus);
}

/**
 * Opens the dialog to edit an item.
 *
 * @param item - The item to edit.
 * @param focus - What to focus when the dialog closes; by default, what has focus now.
 */
export function startEdit(item: TItem, focus: HTMLElement | null = focusedElement()): void {
  if (editor.saving) {
    return;
  }

  const draft: TDraft = {
    key: nextKey++,
    file: null,
    url: null,
    ownsUrl: false,
    info: { format: item.format, mime: item.mime, width: item.width, height: item.height, animated: item.animated },
    hash: null,
    error: null,
    title: item.title,
    type: item.type,
    description: item.description,
    tags: item.tags.flatMap(id => library.tags.find(tag => tag.id === id)?.name ?? []),
  };

  ticket++;
  open("edit", item, [draft], focus);

  void thumbnail(item).then((url) => {
    // Still the same dialog, and the user has not picked a replacement file meanwhile.
    if (editor.drafts[0]?.key === draft.key && !editor.drafts[0].file) {
      editor.drafts[0].url = url;
    }
  });
}

/**
 * Swaps the file of the item being edited.
 *
 * @param draft - The draft being edited.
 * @param file - The new file.
 * @returns Once the dialog shows the new file.
 */
export async function replaceFile(draft: TDraft, file: File): Promise<void> {
  const opened = session;

  editor.reading++;

  const read = await readFile(file);

  if (opened !== session) {
    release([{ ...draft, ...read }]);

    return;
  }

  editor.reading--;

  const current = editor.drafts.find(found => found.key === draft.key);

  if (!current) {
    release([{ ...draft, ...read }]);

    return;
  }

  // An unusable replacement keeps the current file, with the reason shown.
  if (!read.info) {
    current.error = read.error;

    return;
  }

  release([current]);
  Object.assign(current, read, { file });
}

/**
 * Drops one file from the add dialog.
 *
 * @param draft - The file to drop.
 */
export function removeDraft(draft: TDraft): void {
  if (editor.saving) {
    return;
  }

  release(editor.drafts.filter(found => found.key === draft.key));
  editor.drafts = editor.drafts.filter(found => found.key !== draft.key);

  if (!editor.drafts.length) {
    closeEditor();
  }
}

/**
 * Closes the dialog, giving focus back to where it was. Nothing happens while it saves.
 */
export function closeEditor(): void {
  if (editor.saving || !editor.mode) {
    return;
  }

  const focus = returnFocus;

  clear();

  if (focus?.isConnected) {
    focus.focus();
  }
}

/**
 * Drops the dialog without saving or moving focus, when Nitfree is torn down.
 */
export function resetEditor(): void {
  ticket++;
  clear();
}

/**
 * Turns tag names into tag ids, creating the tags that do not exist yet.
 *
 * @param names - The names chosen for an item.
 * @returns The ids.
 */
async function tagIds(names: readonly string[]): Promise<string[]> {
  const { ids, missing } = resolveTagNames(names, library.tags);

  for (const name of missing) {
    const [error, created] = await tryCatch(sendMessage("tags:add", { name }));

    if (created) {
      ids.push(created.id);
      continue;
    }

    // Another tab may have created it meanwhile.
    const existing = (await sendMessage("tags:list")).find(tag => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase());

    if (!existing) {
      throw toError(error);
    }

    ids.push(existing.id);
  }

  return ids;
}

/**
 * Saves the dialog: adds every usable file, or updates the edited item. Files that fail stay in the
 * dialog with the reason; the dialog closes once everything is saved. It cannot be closed or changed
 * while it saves.
 *
 * @returns Whether everything was saved.
 */
export async function saveEditor(): Promise<boolean> {
  if (editor.saving || editor.reading || !editor.mode) {
    return false;
  }

  const usable = editor.drafts.filter(isUsable);

  if (usable.some(draft => !draft.title.trim())) {
    editor.error = i18n.t("editor.titleRequired");

    return false;
  }

  const { mode, item } = editor;
  const current = session;
  const failed: TDraft[] = [];

  editor.saving = true;
  editor.error = null;

  for (const draft of usable) {
    draft.error = null;

    const [error] = await tryCatch(async () => {
      const tags = await tagIds(draft.tags);
      const details = { title: draft.title.trim(), type: draft.type, description: draft.description.trim(), tags };

      if (mode === "edit" && item) {
        await sendMessage("library:update", { id: item.id, patch: { ...details, ...(draft.file && { file: draft.file }) } });
      }
      else if (mode === "add" && draft.file) {
        await sendMessage("library:add", { file: draft.file, ...details });
      }
    });

    if (error) {
      draft.error = i18n.t("editor.saveFailed", { error: toError(error).message });
      failed.push(draft);
    }

    // Nitfree was torn down meanwhile.
    if (current !== session) {
      return false;
    }
  }

  editor.saving = false;

  if (failed.length) {
    release(editor.drafts.filter(draft => !failed.includes(draft)));
    editor.drafts = failed;

    return false;
  }

  closeEditor();

  return true;
}
