/**
 * Where the Nitfree panel is shown: as a tab in Discord's expression picker, or in Nitfree's own popover
 * when the picker cannot host it.
 */
export type TPanelMode = "picker" | "popover";

type TPanelState = {
  open: boolean;
  anchor: HTMLElement | null;
  mode: TPanelMode | null;
};

/**
 * Whether the Nitfree panel is open, where, and which chat bar button it belongs to.
 * Shared by every injected button, the popover and the picker tab.
 */
export const panel: TPanelState = $state({ open: false, anchor: null, mode: null });

let handler: (anchor: HTMLElement) => void = togglePopover;
let press: { anchor: HTMLElement; open: boolean } | null = null;

/**
 * Remembers whether the panel was open for a button when the pointer went down on it. Discord closes
 * its picker on a press outside it, so by the time the click arrives the panel already looks closed.
 *
 * @param anchor - The chat bar button being pressed.
 */
export function notePress(anchor: HTMLElement): void {
  press = { anchor, open: panel.open && panel.anchor === anchor };
}

/**
 * Whether the panel was open for a button, as of the press that led to this click, or as of now
 * for keyboard activation.
 *
 * @param anchor - The chat bar button that was clicked.
 * @returns Whether the click should close the panel.
 */
export function wasOpenFor(anchor: HTMLElement): boolean {
  const pressed = press?.anchor === anchor ? press.open : null;

  press = null;

  return pressed ?? (panel.open && panel.anchor === anchor);
}

/**
 * Shows the panel.
 *
 * @param mode - Where it is shown.
 * @param anchor - The chat bar button it belongs to, if known.
 */
export function openPanel(mode: TPanelMode, anchor: HTMLElement | null): void {
  panel.anchor = anchor;
  panel.mode = mode;
  panel.open = true;
}

/**
 * Marks the panel as closed. Closing Discord's picker itself is the picker tab's job.
 */
export function closePanel(): void {
  panel.open = false;
  panel.anchor = null;
  panel.mode = null;
}

/**
 * Opens the popover from a button, or closes it when that button already opened it.
 *
 * @param anchor - The chat bar button that was clicked.
 */
export function togglePopover(anchor: HTMLElement): void {
  if (wasOpenFor(anchor)) {
    closePanel();

    return;
  }

  openPanel("popover", anchor);
}

/**
 * Decides what a chat bar button click does; the content script sets this once the picker tab is ready.
 *
 * @param next - The new click handler.
 */
export function setToggleHandler(next: (anchor: HTMLElement) => void): void {
  handler = next;
}

/**
 * Handles a click on a chat bar button.
 *
 * @param anchor - The button that was clicked.
 */
export function togglePanel(anchor: HTMLElement): void {
  handler(anchor);
}
