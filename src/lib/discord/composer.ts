import { SELECTORS } from "./selectors";



export type TChatButtonClasses = {
  container: string;
  button: string;
  wrapper: string;
};

/**
 * Classes Discord uses for picker logic rather than looks; copying them would make Discord treat
 * Nitfree's button as one of its own.
 */
const BEHAVIOR_CLASSES = new Set(["expression-picker-chat-input-button"]);

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
 * Reads the classes that give Discord's chat buttons their size and hover and active states,
 * so Nitfree's button looks exactly like its neighbours.
 *
 * @param group - A composer button group.
 * @returns The classes, empty when Discord's markup has changed.
 */
export function readChatButtonClasses(group: Element): TChatButtonClasses {
  const model = findAll(group, SELECTORS.chatButtonModel)[0];
  const button = model?.querySelector("[role=\"button\"]");

  return {
    container: looksOnly(model, /^buttonContainer_/),
    button: looksOnly(button, /^button_/),
    wrapper: looksOnly(button?.querySelector("[class^=\"buttonWrapper_\"]"), /^buttonWrapper_/),
  };
}
