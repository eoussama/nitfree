type TPanelState = {
  open: boolean;
  anchor: HTMLElement | null;
};

/**
 * Whether the Nitfree panel is open, and which chat bar button opened it.
 * Shared by every injected button and the panel itself.
 */
export const panel: TPanelState = $state({ open: false, anchor: null });

/**
 * Opens the panel from a button, or closes it when that button already opened it.
 *
 * @param anchor - The chat bar button that was clicked.
 */
export function togglePanel(anchor: HTMLElement): void {
  if (panel.open && panel.anchor === anchor) {
    closePanel();

    return;
  }

  panel.anchor = anchor;
  panel.open = true;
}

/**
 * Closes the panel.
 */
export function closePanel(): void {
  panel.open = false;
  panel.anchor = null;
}
