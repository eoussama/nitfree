import type { TItem } from "~/lib/db";
import type { TCopiedRow } from "~/lib/discord";
import type { TSuggestionsAt } from "~/lib/settings";

import { untrack } from "svelte";

import { composerOf, copyEmojiRow, discordOptions, emojiRows, findDiscordAutocomplete, messageBoxOf } from "~/lib/discord";
import { picksSend } from "~/lib/settings";

import { findEmojiQuery, suggestItems } from "./autocomplete";
import { library } from "./library.svelte";
import { preferences } from "./preferences.svelte";
import { still } from "./thumbnails";



type TSuggestState = {
  // The message box being typed in, while it has suggestions.
  box: HTMLElement | null;
  query: string;
  items: TItem[];
  // Where they show: as rows at the end of Discord's own autocomplete, or, when Discord shows none, in
  // a list of their own styled like it.
  mode: "inline" | "list" | null;
  // The highlighted suggestion. Inline, null while Discord's own rows have the keys.
  highlighted: number | null;
};

/**
 * The Nitfree emojis suggested for the `:name` being typed. The list of their own lives in the page
 * overlay; the rows they add to Discord's autocomplete live in it.
 */
export const suggest: TSuggestState = $state({ box: null, query: "", items: [], mode: null, highlighted: null });

type TPick = (item: TItem, send: boolean, composer: Element) => void;

/**
 * Lets the highlighted Nitfree row show alone, as Discord's own highlight stays on the row it last had;
 * and draws the badge saying what each Nitfree row is, as Discord draws its small labels.
 */
const STYLE = `
[data-nitfree-suggesting] [role="option"][aria-selected="true"]:not([data-nitfree-option]) > * { background-color: transparent; }
[data-nitfree-type] {
  flex: none;
  margin-inline-start: auto;
  padding: 0 6px;
  border-radius: 4px;
  background-color: var(--background-mod-normal, rgb(151 151 159 / 16%));
  color: var(--text-muted, #949ba4);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  text-transform: uppercase;
}
`;

let onpick: TPick | null = null;

// The query Escape hid the suggestions for, in that box, until something else is typed.
let dismissed: { box: HTMLElement; query: string } | null = null;

// The rows added to Discord's list, for the items they show.
let rows: { list: Element; items: TItem[]; at: TSuggestionsAt; copies: TCopiedRow[] } | null = null;

// How the keys went from Discord's rows to Nitfree's: down past Discord's last, or up past its first.
// Discord's highlight stays where it was meanwhile, so leaving gives it back what it expects.
let entered: "end" | "start" = "end";

// Watch the box, for Discord's list coming and going, and the list, which Discord draws again on every key.
let boxObserver: MutationObserver | null = null;
let listObserver: MutationObserver | null = null;
let watched: { box: Element | null; list: Element | null } = { box: null, list: null };

/**
 * The text of the line before the caret, when the caret is in the box and nothing is selected.
 *
 * @param box - The message box.
 * @returns The text, or null.
 */
function textBeforeCaret(box: HTMLElement): string | null {
  const selection = box.ownerDocument.getSelection();
  const caret = selection?.rangeCount ? selection.getRangeAt(0) : null;

  if (!caret?.collapsed || !box.contains(caret.startContainer)) {
    return null;
  }

  const node = caret.startContainer instanceof Element ? caret.startContainer : caret.startContainer.parentElement;
  // Each line of Discord's editor is one of its elements.
  // Stryker disable next-line OptionalChaining: an element's parent is only missing for a detached node, which holds no caret.
  const line = node?.closest("[data-slate-node=\"element\"]") ?? box;
  const range = box.ownerDocument.createRange();

  range.setStart(line, 0);
  range.setEnd(caret.startContainer, caret.startOffset);

  // Discord's editor keeps zero-width characters where lines are empty.
  return range.toString().replace(/\uFEFF/g, "");
}

function removeRows(): void {
  for (const { row } of rows?.copies ?? []) {
    row.remove();
  }

  rows?.list.removeAttribute("data-nitfree-suggesting");
  rows = null;
}

function close(): void {
  removeRows();
  suggest.box = null;
  suggest.query = "";
  suggest.items = [];
  suggest.mode = null;
  suggest.highlighted = null;
}

/**
 * Keeps Nitfree's rows together after Discord's last emoji row, or before its first, as the popup
 * says; made again when the suggestions change, put back when Discord draws its list again, and
 * showing which one is highlighted.
 *
 * @param list - Discord's autocomplete list.
 * @param discord - Discord's emoji rows.
 */
function placeRows(list: Element, discord: readonly HTMLElement[]): void {
  const first = preferences.suggestionsAt === "start";
  const anchor = (first ? discord[0] : discord.at(-1))!;

  if (rows && (rows.list !== list || rows.items !== suggest.items || rows.at !== preferences.suggestionsAt)) {
    removeRows();
  }

  if (!rows) {
    rows = {
      list,
      items: suggest.items,
      at: preferences.suggestionsAt,
      copies: suggest.items.map((item, index) => {
        const copy = copyEmojiRow(anchor, `nitfree-autocomplete-${index}`, item.title, i18n.t(`panel.types.${item.type}`));

        copy.row.addEventListener("mousedown", (event) => {
          // Typing goes on in the message box.
          event.preventDefault();
        });
        copy.row.addEventListener("pointermove", () => highlightSuggestion(index));
        copy.row.addEventListener("click", event => pickSuggestion(item, !event.shiftKey));
        void still(item).then((url) => {
          if (url) {
            copy.image.src = url;
          }
        });

        return copy;
      }),
    };
  }

  const copies = rows.copies.map(copy => copy.row);
  const together = copies.every((row, index) => !index || row.previousElementSibling === copies[index - 1]);
  const placed = together && (first ? copies.at(-1)!.nextElementSibling === anchor : copies[0]!.previousElementSibling === anchor);

  if (!placed) {
    if (first) {
      anchor.before(...copies);
    }
    else {
      anchor.after(...copies);
    }
  }

  rows.copies.forEach(({ row }, index) => {
    const selected = String(index === suggest.highlighted);

    if (row.getAttribute("aria-selected") !== selected) {
      row.setAttribute("aria-selected", selected);
    }
  });

  if (suggest.highlighted === null) {
    list.removeAttribute("data-nitfree-suggesting");
  }
  else if (!list.hasAttribute("data-nitfree-suggesting")) {
    list.setAttribute("data-nitfree-suggesting", "");
  }
}

// Follows the box's link to Discord's list, and the list itself.
// Stryker disable ConditionalExpression,EqualityOperator,BooleanLiteral,ObjectLiteral: watching again what is watched already, or watching the list's depth, changes nothing seen.
function watch(box: Element | null, list: Element | null): void {
  if (watched.box !== box) {
    boxObserver?.disconnect();

    if (box) {
      boxObserver ??= new MutationObserver(update);
      boxObserver.observe(box, { attributes: true, attributeFilter: ["aria-expanded", "aria-controls"] });
    }
  }

  if (watched.list !== list) {
    listObserver?.disconnect();

    if (list) {
      listObserver ??= new MutationObserver(update);
      listObserver.observe(list, { childList: true, subtree: true });
    }
  }

  watched = { box, list };
}
// Stryker restore ConditionalExpression,EqualityOperator,BooleanLiteral,ObjectLiteral

/**
 * Reads what is being typed and updates the suggestions.
 */
function update(): void {
  const box = preferences.autocomplete ? messageBoxOf(document.activeElement) : null;
  const text = box ? textBeforeCaret(box) : null;
  // Stryker disable next-line ConditionalExpression: with no text there is no box, and nothing is read of a missing one.
  const query = text === null ? null : findEmojiQuery(text);
  const list = box ? findDiscordAutocomplete(box) : null;

  watch(box, list);

  // Typing anything else, or going to another box, ends the hiding.
  if (dismissed && (dismissed.box !== box || dismissed.query !== query)) {
    dismissed = null;
  }

  if (!box || !query || dismissed) {
    close();

    return;
  }

  const items = suggestItems(library.items, library.tags, query);
  const discord = list ? emojiRows(list) : [];
  const mode = discord.length ? "inline" : "list";

  if (!items.length) {
    close();

    return;
  }

  // Something new to show: inline, Discord keeps the keys; in a list of their own, the first is highlighted.
  if (suggest.box !== box || suggest.query !== query || suggest.mode !== mode || suggest.items.length !== items.length || suggest.items.some((item, index) => item.id !== items[index]?.id)) {
    suggest.items = items;
    suggest.highlighted = mode === "inline" ? null : 0;
  }

  suggest.box = box;
  suggest.query = query;
  suggest.mode = mode;

  // Stryker disable next-line LogicalOperator: inline is the mode exactly when Discord has rows, which needs a list.
  if (list && discord.length) {
    placeRows(list, discord);
  }
  else {
    removeRows();
  }
}

/**
 * Takes the `:name` out of the message the way a Backspace over a selection does, so Discord's editor
 * makes the change itself rather than finding its text changed under it.
 *
 * @param box - The message box.
 * @param query - The name typed after the colon.
 */
function removeQuery(box: HTMLElement, query: string): void {
  const selection = box.ownerDocument.getSelection();

  if (!selection) {
    return;
  }

  for (let i = 0; i < [...query].length + 1; i++) {
    selection.modify("extend", "backward", "character");
  }

  if (selection.toString().replace(/\uFEFF/g, "") !== `:${query}`) {
    selection.collapseToEnd();

    return;
  }

  const event = new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true });

  box.dispatchEvent(event);

  // A plain editable field, with no editor to take the event.
  if (!event.defaultPrevented) {
    box.ownerDocument.execCommand("delete");
  }
}

/**
 * Picks a suggestion: the `:name` goes, and the emoji joins the message, sent or not as the popup
 * says for a plain click, or the other way.
 *
 * @param item - The chosen emoji.
 * @param primary - True for Enter or a click, false for Tab or a Shift+click.
 */
export function pickSuggestion(item: TItem, primary: boolean): void {
  const { box, query } = suggest;
  const composer = box && composerOf(box);

  close();

  if (!box || !composer) {
    return;
  }

  removeQuery(box, query);
  // Stryker disable next-line OptionalChaining: picking is only wired while the suggestions are followed, which sets it.
  onpick?.(item, picksSend(primary, preferences.clickAction), composer);
}

/**
 * Highlights a suggestion, such as the one under the pointer.
 *
 * @param index - Its place in the list.
 */
export function highlightSuggestion(index: number): void {
  if (suggest.mode === "inline" && suggest.highlighted === null && suggest.box) {
    // Inline, Nitfree's rows are in Discord's list.
    const options = discordOptions(rows!.list);

    entered = options[0]?.id === suggest.box.getAttribute("aria-activedescendant") ? "start" : "end";
  }

  suggest.highlighted = index;
  update();
}

/**
 * Moves through the suggestions inline: Discord's rows keep the keys until the highlight moves past
 * its last row, or above its first, onto Nitfree's; leaving them gives the keys back.
 *
 * @param down - Whether the key moves down.
 * @returns Whether Nitfree took the key.
 */
function moveInline(down: boolean): boolean {
  const { box, items, highlighted } = suggest;
  const options = discordOptions(rows!.list);
  // Stryker disable next-line OptionalChaining: keys are only taken while there is a box.
  const active = box?.getAttribute("aria-activedescendant");

  if (highlighted === null) {
    if (down && active === options.at(-1)?.id) {
      entered = "end";
      suggest.highlighted = 0;
    }
    // Stryker disable next-line OptionalChaining: Discord's rows exist while the suggestions are inline.
    else if (!down && active === options[0]?.id) {
      entered = "start";
      suggest.highlighted = items.length - 1;
    }
    else {
      return false;
    }

    update();

    return true;
  }

  const next = highlighted + (down ? 1 : -1);

  if (next >= 0 && next < items.length) {
    suggest.highlighted = next;
    update();

    return true;
  }

  // Back to Discord: its highlight is still on its last row when the keys came from there, or on its
  // first; the key then moves it on, or is kept so it stays.
  suggest.highlighted = null;
  update();

  return down ? entered === "start" : entered === "end";
}

// Inline, Discord keeps its keys until its highlight moves onto Nitfree's rows; in a list of their own,
// the suggestions take them. Escape hides them and leaves the rest to Discord.
function onKeydown(event: KeyboardEvent): void {
  const { box, items, mode, highlighted } = suggest;

  // Stryker disable next-line ConditionalExpression,LogicalOperator: with a box there are always items, and without one the box is not in the path.
  if (!box || !items.length || event.isComposing || !event.composedPath().includes(box) || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  let taken = false;

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (mode === "inline") {
      taken = moveInline(event.key === "ArrowDown");
    }
    else {
      suggest.highlighted = ((highlighted ?? 0) + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      taken = true;
    }
  }
  // Stryker disable next-line ConditionalExpression: with nothing highlighted there is no item to take either.
  else if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && highlighted !== null) {
    const item = items[highlighted];

    if (item) {
      pickSuggestion(item, event.key === "Enter");
      taken = true;
    }
  }
  else if (event.key === "Escape") {
    dismissed = { box, query: suggest.query };
    close();
  }

  if (taken) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

/**
 * Suggests Nitfree emojis while `:name` is typed in Discord's message box: as rows at the end of
 * Discord's own emoji autocomplete, looking like its own, or in a list styled like it when Discord
 * suggests nothing.
 *
 * @param pick - Puts a chosen emoji in its composer, sending it or not.
 * @returns A function that stops it.
 */
export function followSuggestions(pick: TPick): () => void {
  onpick = pick;

  const style = document.createElement("style");

  style.id = "nitfree-suggestions-style";
  style.textContent = STYLE;
  document.head.append(style);

  const stopLibrary = $effect.root(() => {
    // The library or the setting changed while typing.
    $effect(() => {
      void library.items;
      void library.tags;
      void preferences.autocomplete;
      void preferences.suggestionsAt;
      // It reads the suggestions it writes, which must not run it again.
      untrack(update);
    });
  });

  document.addEventListener("selectionchange", update);
  document.addEventListener("input", update, true);
  document.addEventListener("focusout", update, true);
  // Before Discord's own listeners, which move through and pick from its autocomplete.
  window.addEventListener("keydown", onKeydown, true);

  // Stryker disable StringLiteral,BooleanLiteral,OptionalChaining,ObjectLiteral: happy-dom removes a listener whatever its capture flag, as browsers do not; the rest is bookkeeping before the state is reset.
  return () => {
    document.removeEventListener("selectionchange", update);
    document.removeEventListener("input", update, true);
    document.removeEventListener("focusout", update, true);
    window.removeEventListener("keydown", onKeydown, true);
    stopLibrary();
    boxObserver?.disconnect();
    listObserver?.disconnect();
    boxObserver = null;
    listObserver = null;
    watched = { box: null, list: null };
    onpick = null;
    dismissed = null;
    close();
    style.remove();
  };
}
