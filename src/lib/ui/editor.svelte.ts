import type { TNamed } from "./drafts";
import type { TItem, TItemType } from "~/lib/db";
import type { TImageInfo } from "~/lib/media";

import type { TEdits } from "~/lib/media/edit";
import type { TClip } from "~/lib/media/video";

import { toError, tryCatch } from "@eoussama/core";
import { areSimilar } from "~/lib/db/duplicates";
import { hashBytes } from "~/lib/db/library";
import { inspectImage } from "~/lib/media";
import { applyEdits, editedFileName } from "~/lib/media/edit";
import { imageFingerprint } from "~/lib/media/fingerprint";

import { sendMessage } from "~/lib/messaging";

import { guessItemType, isAcceptedFile, isVideoFile, resolveTagNames, titleFromFileName, videoItemType } from "./drafts";
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
  // How the picture looks, and the library item that looks the same, such as a resized copy or the
  // same image saved by Discord: to warn about copies that are not the same file.
  fingerprint: string | null;
  similar: TItem | null;
  error: string | null;
  title: string;
  type: TItemType;
  description: string;
  tags: string[];
  // The names of the packs the item is in, as tags are named; new ones are made on saving.
  packs: string[];
  // The file before quick edits, kept to edit again from or to go back to, and the edits made to it;
  // both null when the image is not edited.
  source: File | null;
  edits: TEdits | null;
  // The library item this draft is an edited copy of: it is added as a new item, and that one stays as it is.
  copyOf: TItem | null;
  // The video the draft's GIF is made from, and the clip taken from it, to make it again from; the
  // clip is null until the GIF is made, and the draft cannot be saved before.
  video: File | null;
  clip: TClip | null;
  // Told the saved name once the file is in the library, such as to confirm a save from chat.
  onsaved?: (title: string) => void;
};

type TEditorState = {
  // "view" shows an item read only, with the same fields as "edit".
  mode: "add" | "edit" | "view" | null;
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

// Stryker disable UpdateOperator: keys, sessions and tickets are only compared for being the same, so counting down works as well.
let nextKey = 0;
// Bumped whenever the dialog opens or closes, so a save that outlives its dialog changes nothing.
let session = 0;
// Bumped by each request to open the add dialog, so only the latest files picked, dropped or pasted open it.
let ticket = 0;
// What had focus before the dialog opened, focused again when it closes.
let returnFocus: HTMLElement | null = null;

type TRead = Pick<TDraft, "info" | "hash" | "fingerprint" | "similar" | "error" | "url" | "ownsUrl">;

// The library item showing the same picture; none when the background cannot tell.
async function findSimilar(fingerprint: string | null, info: TImageInfo | null): Promise<TItem | null> {
  // Stryker disable next-line LogicalOperator: a fingerprint is only taken of an image that was read.
  if (!fingerprint || !info) {
    return null;
  }

  const [, found] = await tryCatch(sendMessage("library:similar", { fingerprint, width: info.width, height: info.height }));

  return found ?? null;
}

async function readFile(file: File): Promise<TRead> {
  if (!isAcceptedFile(file) && !file.type.startsWith("image/")) {
    return { info: null, hash: null, fingerprint: null, similar: null, error: i18n.t("editor.unsupported"), url: null, ownsUrl: false };
  }

  // A file moved or changed since it was picked cannot be read any more.
  const [error, bytes] = await tryCatch(file.arrayBuffer());

  if (error) {
    return { info: null, hash: null, fingerprint: null, similar: null, error: i18n.t("editor.unreadable"), url: null, ownsUrl: false };
  }

  const info = inspectImage(new Uint8Array(bytes));
  const fingerprint = info ? await imageFingerprint(file).catch(() => null) : null;

  return {
    info,
    hash: info ? await hashBytes(new Uint8Array(bytes)) : null,
    fingerprint,
    similar: await findSimilar(fingerprint, info),
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

  // Stryker disable next-line OptionalChaining: a document always has an active element, the body at least.
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  return active instanceof HTMLElement && active !== document.body ? active : null;
}

function open(mode: "add" | "edit" | "view", item: TItem | null, drafts: TDraft[], focus: HTMLElement | null): void {
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
 * would keep a second copy: the same file, or one showing the same picture, such as a resized copy or
 * the same image as Discord serves it.
 *
 * @param draft - A draft in the dialog.
 * @returns The warning, or null.
 */
export function duplicateWarning(draft: TDraft): string | null {
  if (!draft.hash) {
    return null;
  }

  // Not the item being edited, nor the one an edited copy is made from.
  const others = (found: TItem) => found.id !== editor.item?.id && found.id !== draft.copyOf?.id;
  const item = library.items.find(found => found.hash === draft.hash && others(found));

  if (item) {
    return i18n.t("editor.duplicate", { title: item.title });
  }

  const index = editor.drafts.findIndex(found => found.key === draft.key);
  const earlier = editor.drafts.slice(0, index);

  if (earlier.some(found => found.hash === draft.hash)) {
    return i18n.t("editor.duplicateDraft");
  }

  // Read from the library as it is now, so an item deleted meanwhile is not named.
  // Stryker disable next-line OptionalChaining: checked just before.
  const similar = draft.similar && library.items.find(found => found.id === draft.similar?.id && others(found));

  if (similar) {
    return i18n.t("editor.similar", { title: similar.title });
  }

  const { fingerprint, info } = draft;
  const looksLike = (found: TDraft) => found.fingerprint && found.info && fingerprint && info
    && areSimilar({ ...info, fingerprint }, { ...found.info, fingerprint: found.fingerprint });

  return earlier.some(looksLike) ? i18n.t("editor.similarDraft") : null;
}

/**
 * What is already known about files being added, such as the name and type of an emoji saved from
 * chat, and what to do once they are saved.
 */
export type TDraftPreset = Partial<Pick<TDraft, "title" | "type" | "onsaved">>;

// A video shows as it is until a GIF is made from it.
function readVideo(file: File): TRead {
  return { info: null, hash: null, fingerprint: null, similar: null, error: null, url: URL.createObjectURL(file), ownsUrl: true };
}

async function readDrafts(files: readonly File[], preset: TDraftPreset): Promise<TDraft[]> {
  return Promise.all(files.map(async (file): Promise<TDraft> => {
    const video = isVideoFile(file) ? file : null;
    const read = video ? readVideo(video) : await readFile(file);

    return {
      key: nextKey++,
      file: video ? null : file,
      ...read,
      title: preset.title ?? titleFromFileName(file.name),
      type: preset.type ?? (video ? "sticker" : guessItemType(read.info)),
      description: "",
      tags: [],
      packs: [],
      source: null,
      edits: null,
      copyOf: null,
      video,
      clip: null,
      onsaved: preset.onsaved,
    };
  }));
}

/**
 * Whether the add dialog can take files now: not while the edit dialog is open or anything is saving.
 *
 * @returns Whether files would be added.
 */
export function canStartAdd(): boolean {
  return !editor.saving && (editor.mode === null || editor.mode === "add");
}

/**
 * Opens the dialog to add files: picked, dropped, pasted or saved from chat. Titles come from the file
 * names and the type is guessed from each image, unless the preset says them; files Nitfree cannot use
 * are listed with the reason. Files added while the add dialog is open join it.
 *
 * @param files - The files to add.
 * @param focus - What to focus when the dialog closes; by default, what has focus now.
 * @param preset - The title and type to give the files instead of guessing them.
 * @returns Once the dialog shows the files.
 */
export async function startAdd(files: Iterable<File>, focus: HTMLElement | null = focusedElement(), preset: TDraftPreset = {}): Promise<void> {
  const list = [...files];

  if (!list.length || !canStartAdd()) {
    return;
  }

  // Joining the open add dialog: the files count only if that dialog is still open once they are read.
  if (editor.mode === "add") {
    const current = session;

    editor.reading++;

    const drafts = await readDrafts(list, preset);

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
  const drafts = await readDrafts(list, preset);

  // Stryker disable next-line LogicalOperator: an older request that opens anyway is opened over by the latest, which lets its files go.
  if (mine !== ticket || editor.mode) {
    release(drafts);

    return;
  }

  open("add", null, drafts, focus);
}

function itemDraft(item: TItem): TDraft {
  return {
    key: nextKey++,
    file: null,
    url: null,
    ownsUrl: false,
    info: { format: item.format, mime: item.mime, width: item.width, height: item.height, animated: item.animated },
    hash: null,
    fingerprint: null,
    similar: null,
    error: null,
    title: item.title,
    type: item.type,
    description: item.description,
    tags: item.tags.flatMap(id => library.tags.find(tag => tag.id === id)?.name ?? []),
    packs: item.packs.flatMap(id => library.packs.find(pack => pack.id === id)?.name ?? []),
    source: null,
    edits: null,
    copyOf: null,
    video: null,
    clip: null,
  };
}

function showThumbnail(draft: TDraft, item: TItem): void {
  void thumbnail(item).then((url) => {
    // Still the same dialog, and the user has not picked a replacement file meanwhile.
    if (editor.drafts[0]?.key === draft.key && !editor.drafts[0].file) {
      editor.drafts[0].url = url;
    }
  });
}

function openItem(mode: "edit" | "view", item: TItem, focus: HTMLElement | null): void {
  const draft = itemDraft(item);

  ticket++;
  open(mode, item, [draft], focus);
  showThumbnail(draft, item);
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

  openItem("edit", item, focus);
}

/**
 * Opens the dialog to look at an item: the same fields as editing, read only, with Favorite,
 * Download and Edit.
 *
 * @param item - The item to show.
 * @param focus - What to focus when the dialog closes; by default, what has focus now.
 */
export function startView(item: TItem, focus: HTMLElement | null = focusedElement()): void {
  if (editor.saving) {
    return;
  }

  openItem("view", item, focus);
}

/**
 * Makes the open item dialog editable, with the item as the library has it now.
 */
export function editFromView(): void {
  // Stryker disable next-line OptionalChaining: checked just before.
  const item = editor.mode === "view" && editor.item ? library.items.find(found => found.id === editor.item?.id) : null;
  const draft = editor.drafts[0];

  if (!item || !draft) {
    return;
  }

  Object.assign(draft, itemDraft(item), { key: draft.key, url: draft.url });
  editor.item = item;
  editor.mode = "edit";
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
  Object.assign(current, read, { file, source: null, edits: null, video: null, clip: null });
}

/**
 * The file quick edits start from: the original of an edited draft, else the draft's file, else the
 * file of the item being edited.
 *
 * @param draft - A draft in the dialog.
 * @returns The file, or null when the item's file is missing.
 */
export async function editSource(draft: TDraft): Promise<File | null> {
  const item = editor.item;
  const file = draft.source ?? draft.file;

  if (file) {
    return file;
  }

  const blob = item ? await sendMessage("library:file", { id: item.id }) : null;

  return item && blob ? new File([blob], `${item.title}.${item.format}`, { type: blob.type }) : null;
}

/**
 * Gives a draft the image made from its original with quick edits; the original is kept, to edit
 * again from or to go back to. Edits to an item in the library make a new version: the dialog then
 * adds it as a new item, and that item stays as it is.
 *
 * @param draft - A draft in the dialog.
 * @param source - The original, from {@link editSource}.
 * @param edits - The edits.
 * @returns Once the dialog shows the edited image.
 */
export async function editDraft(draft: TDraft, source: File, edits: TEdits): Promise<void> {
  const opened = session;
  const info = inspectImage(new Uint8Array(await source.arrayBuffer()));

  if (!info) {
    throw new Error(i18n.t("editor.unsupported"));
  }

  const blob = await applyEdits(source, info, edits);
  const file = new File([blob], editedFileName(source.name, blob.type), { type: blob.type });
  const read = await readFile(file);
  const current = editor.drafts.find(found => found.key === draft.key);

  // Stryker disable next-line ConditionalExpression: a dialog closed meanwhile has none of its drafts left either.
  if (opened !== session || !current) {
    release([{ ...draft, ...read }]);

    return;
  }

  release([current]);
  Object.assign(current, read, { file, source, edits });

  // Stryker disable next-line ConditionalExpression,LogicalOperator: only editing has an item, and making a copy of none leaves an added draft as it is.
  if (editor.mode === "edit" && editor.item) {
    current.copyOf = editor.item;
    editor.item = null;
    editor.mode = "add";
  }
}

/**
 * Takes quick edits back: the draft gets its original again. An edited copy of a library item goes
 * back to editing that item, as long as it is still there.
 *
 * @param draft - An edited draft.
 * @returns Once the dialog shows the original.
 */
export async function revertDraft(draft: TDraft): Promise<void> {
  const opened = session;
  const current = editor.drafts.find(found => found.key === draft.key);

  if (!current?.source) {
    return;
  }

  // Stryker disable next-line OptionalChaining: checked just before.
  const item = current.copyOf && library.items.find(found => found.id === current.copyOf?.id);

  if (item) {
    release([current]);
    Object.assign(current, itemDraft(item), { key: current.key, title: current.title, type: current.type, description: current.description, tags: current.tags, packs: current.packs });
    editor.item = item;
    editor.mode = "edit";
    showThumbnail(current, item);

    return;
  }

  const source = current.source;
  const read = await readFile(source);

  // Stryker disable next-line ConditionalExpression: a dialog closed meanwhile has none of its drafts left either.
  if (opened !== session || !editor.drafts.includes(current)) {
    release([{ ...current, ...read }]);

    return;
  }

  release([current]);
  Object.assign(current, read, { file: source, source: null, edits: null, copyOf: null });
}

/**
 * Gives a video's draft the GIF made from it, with the clip it was made from, to make it again
 * from. Quick edits made to the previous GIF are dropped. The first GIF also sets the type: a
 * sticker up to a sticker's size, else a GIF.
 *
 * @param draft - A draft of a video.
 * @param clip - The clip the GIF was made from.
 * @param gif - The GIF.
 * @returns Once the dialog shows the GIF.
 */
export async function convertDraft(draft: TDraft, clip: TClip, gif: Blob): Promise<void> {
  const opened = session;
  const video = draft.video;

  if (!video) {
    return;
  }

  const file = new File([gif], editedFileName(video.name, gif.type), { type: gif.type });
  const read = await readFile(file);
  const current = editor.drafts.find(found => found.key === draft.key);

  // Stryker disable next-line ConditionalExpression: a dialog closed meanwhile has none of its drafts left either.
  if (opened !== session || !current) {
    release([{ ...draft, ...read }]);

    return;
  }

  if (read.info && !current.clip) {
    current.type = videoItemType(read.info);
  }

  release([current]);
  Object.assign(current, read, { file, clip, source: null, edits: null });
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
 * Turns tag or pack names into ids, creating the ones that do not exist yet.
 *
 * @param names - The names chosen for an item.
 * @param known - The library's tags, or its packs.
 * @param create - Creates one by name.
 * @param list - Lists them all again.
 * @returns The ids.
 */
async function namedIds(names: readonly string[], known: readonly TNamed[], create: (name: string) => Promise<TNamed>, list: () => Promise<TNamed[]>): Promise<string[]> {
  const { ids, missing } = resolveTagNames(names, known);

  for (const name of missing) {
    const [error, created] = await tryCatch(create(name));

    if (created) {
      ids.push(created.id);
      continue;
    }

    // Another tab may have created it meanwhile.
    const existing = (await list()).find(named => named.name.toLocaleLowerCase() === name.toLocaleLowerCase());

    if (!existing) {
      throw toError(error);
    }

    ids.push(existing.id);
  }

  return ids;
}

function tagIds(names: readonly string[]): Promise<string[]> {
  return namedIds(names, library.tags, name => sendMessage("tags:add", { name }), () => sendMessage("tags:list"));
}

// A pack deleted while the dialog was open, such as from another tab, is made again, as a tag would be.
function packIds(names: readonly string[]): Promise<string[]> {
  return namedIds(names, library.packs, name => sendMessage("packs:add", { name }), () => sendMessage("packs:list"));
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
      const packs = await packIds(draft.packs);
      const details = { title: draft.title.trim(), type: draft.type, description: draft.description.trim(), tags, packs };

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
    else {
      draft.onsaved?.(draft.title.trim());
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
