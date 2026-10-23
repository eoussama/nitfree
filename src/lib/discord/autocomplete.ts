import { CLASS_PATTERNS } from "./selectors";



/**
 * Marks the rows Nitfree adds to Discord's autocomplete, so they are never taken for Discord's own.
 */
export const NITFREE_OPTION = "data-nitfree-option";

export type TCopiedRow = {
  row: HTMLElement;
  image: HTMLImageElement;
};

function hasClass(element: Element, pattern: RegExp): boolean {
  return [...element.classList].some(name => pattern.test(name));
}

function find(root: Element, pattern: RegExp): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>("*")].find(element => hasClass(element, pattern)) ?? null;
}

/**
 * Discord's own rows in its autocomplete list, in order.
 *
 * @param list - The list.
 * @returns The rows.
 */
export function discordOptions(list: Element): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>(`[role="option"]:not([${NITFREE_OPTION}])`)];
}

/**
 * Discord's emoji rows, in order: the ones Nitfree's rows copy, and go before or after.
 *
 * @param list - Discord's autocomplete list.
 * @returns The rows, none when the list shows no emoji.
 */
export function emojiRows(list: Element): HTMLElement[] {
  return discordOptions(list).filter(row => hasClass(row, CLASS_PATTERNS.autocompleteRowVertical) && find(row, CLASS_PATTERNS.autocompleteEmoji));
}

/**
 * Copies one of Discord's emoji rows for another item, so it looks exactly like Discord's: its image
 * and name swapped, and in place of the line naming a server, a badge at the end saying what the item
 * is. The copy carries none of Discord's handlers.
 *
 * @param model - Discord's row.
 * @param id - The copy's id.
 * @param title - The item's name.
 * @param badge - What the item is, such as "GIF".
 * @returns The copy, and its image to show the item in.
 */
export function copyEmojiRow(model: HTMLElement, id: string, title: string, badge: string): TCopiedRow {
  const row = model.cloneNode(true) as HTMLElement;

  // What ties a row to Discord's list navigation stays with Discord's rows.
  for (const name of row.getAttributeNames()) {
    if (name.startsWith("data-list")) {
      row.removeAttribute(name);
    }
  }

  row.id = id;
  row.setAttribute(NITFREE_OPTION, "");
  row.setAttribute("aria-selected", "false");
  find(row, CLASS_PATTERNS.autocompleteSecondary)?.remove();

  const heading = find(row, CLASS_PATTERNS.autocompleteHeading);

  if (heading) {
    heading.textContent = `:${title}:`;
  }

  // A built-in emoji is drawn as text; Nitfree's are images, with Discord's image class.
  const icon = find(row, CLASS_PATTERNS.autocompleteEmoji);
  const image = document.createElement("img");

  image.alt = "";
  image.draggable = false;
  image.className = [...icon?.classList ?? []].filter(name => CLASS_PATTERNS.autocompleteEmojiImage.test(name)).join(" ");
  icon?.replaceWith(image);

  const chip = document.createElement("span");

  chip.dataset.nitfreeType = "";
  chip.textContent = badge;
  (find(row, CLASS_PATTERNS.autocompleteContent) ?? row).append(chip);

  return { row, image };
}
