import { BEHAVIOR_CLASSES, CLASS_PATTERNS, SELECTORS } from "./selectors";



export type TChatButtonClasses = {
  container: string;
  button: string;
  wrapper: string;
};

export type TPickerTabClasses = {
  base: string;
  active: string;
};

/**
 * Finds elements with the first selector of a list that matches anything, so a fallback is only used
 * once Discord's markup has stopped matching the preferred one.
 *
 * @param root - Where to look.
 * @param selectors - Alternatives, most specific first.
 * @returns The matching elements.
 */
export function findAll(root: ParentNode, selectors: readonly string[]): Element[] {
  for (const selector of selectors) {
    const found = [...root.querySelectorAll(selector)];

    if (found.length) {
      return found;
    }
  }

  return [];
}

function looksOnly(element: Element | null | undefined, pattern: RegExp): string {
  return [...element?.classList ?? []].filter(name => pattern.test(name) && !BEHAVIOR_CLASSES.has(name)).join(" ");
}

/**
 * Finds every composer button group on the page: the channel's, and a thread's when one is open beside it.
 *
 * @param root - Where to look.
 * @returns The groups.
 */
export function findChatButtonGroups(root: ParentNode = document): Element[] {
  return findAll(root, SELECTORS.chatButtonGroup);
}

/**
 * Finds the composer button group an element sits in.
 *
 * @param element - An element inside a composer, such as Nitfree's button.
 * @returns The group, or null.
 */
export function chatButtonGroupOf(element: Element): Element | null {
  return element.closest(SELECTORS.chatButtonGroup.join(","));
}

/**
 * Finds the composer an element sits in, such as the one of the Nitfree button that opened the panel.
 *
 * @param element - An element inside a composer.
 * @returns The composer, or null.
 */
export function composerOf(element: Element): Element | null {
  for (const selector of SELECTORS.composer) {
    const found = element.closest(selector);

    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Finds a composer's hidden upload input.
 *
 * @param composer - The composer.
 * @returns The input, or null.
 */
export function findUploadInput(composer: Element): HTMLInputElement | null {
  return (findAll(composer, SELECTORS.uploadInput)[0] as HTMLInputElement | undefined) ?? null;
}

/**
 * Finds a composer's text box.
 *
 * @param composer - The composer.
 * @returns The text box, or null.
 */
export function findMessageBox(composer: Element): HTMLElement | null {
  return (findAll(composer, SELECTORS.messageBox)[0] as HTMLElement | undefined) ?? null;
}

/**
 * Finds the message box an element is, or sits in, such as the focused element while typing.
 *
 * @param element - Any element.
 * @returns The text box, or null.
 */
export function messageBoxOf(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>(SELECTORS.messageBox.join(",")) ?? null;
}

/**
 * Finds the autocomplete Discord shows above a message box, such as its emoji suggestions. The box
 * points to it while it is open.
 *
 * @param box - The message box.
 * @returns The list, or null when it is closed.
 */
export function findDiscordAutocomplete(box: Element): HTMLElement | null {
  const id = box.getAttribute("aria-expanded") === "true" ? box.getAttribute("aria-controls") : null;

  return id ? box.ownerDocument.getElementById(id) : null;
}

/**
 * Lists the attachments waiting in a composer, by the id Discord gives each.
 *
 * @param composer - The composer.
 * @returns The ids of the files the next message carries.
 */
export function draftAttachmentIds(composer: Element): string[] {
  return findAll(composer, SELECTORS.draftAttachment).map(item => item.getAttribute("data-list-item-id") ?? "");
}

/**
 * Finds the chat bar buttons that open Discord's expression picker.
 *
 * @param root - A composer button group, or the whole page.
 * @returns The buttons, in order: GIF, sticker, emoji.
 */
export function findPickerButtons(root: ParentNode = document): HTMLElement[] {
  return findAll(root, SELECTORS.pickerButton) as HTMLElement[];
}

/**
 * Finds a composer's emoji button, falling back to its last picker button.
 *
 * @param group - A composer button group.
 * @returns The button, or null.
 */
export function findEmojiButton(group: Element): HTMLElement | null {
  return (findAll(group, SELECTORS.emojiButton)[0] as HTMLElement | undefined) ?? findPickerButtons(group).at(-1) ?? null;
}

/**
 * Finds the chat bar button whose picker tab Discord considers open, in any composer.
 *
 * @returns The button, or null when the picker is closed.
 */
export function findExpandedPickerButton(): HTMLElement | null {
  return findPickerButtons().find(button => button.getAttribute("aria-expanded") === "true") ?? null;
}

/**
 * Reads the classes that give Discord's chat buttons their size and hover and active states,
 * so Nitfree's button looks exactly like its neighbours.
 *
 * @param group - A composer button group.
 * @returns The classes, empty when Discord's markup has changed.
 */
export function readChatButtonClasses(group: Element): TChatButtonClasses {
  const model = findAll(group, SELECTORS.chatButtonModel)[0];
  const button = model?.querySelector("[role=\"button\"]");
  const wrapper = [...button?.children ?? []].find(child => [...child.classList].some(name => CLASS_PATTERNS.chatButtonWrapper.test(name)));

  return {
    container: looksOnly(model, CLASS_PATTERNS.chatButtonContainer),
    button: looksOnly(button, CLASS_PATTERNS.chatButton),
    wrapper: looksOnly(wrapper, CLASS_PATTERNS.chatButtonWrapper),
  };
}

/**
 * Reads the classes of Discord's picker tabs, so the Nitfree tab looks like them.
 *
 * @param tabList - The picker's tab bar.
 * @returns The classes every tab has, and the one Discord adds to the selected tab.
 */
export function readPickerTabClasses(tabList: Element): TPickerTabClasses {
  const names = [...tabList.querySelectorAll(":scope > [role=\"tab\"]")].flatMap(tab => [...tab.classList]);

  return {
    base: [...new Set(names.filter(name => CLASS_PATTERNS.pickerTab.test(name) && !CLASS_PATTERNS.pickerTabActive.test(name)))].join(" "),
    active: names.find(name => CLASS_PATTERNS.pickerTabActive.test(name)) ?? "",
  };
}
