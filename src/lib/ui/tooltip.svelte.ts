import type { Attachment } from "svelte/attachments";



export type TTooltipSide = "top" | "right" | "bottom" | "left";

type TTooltipState = {
  text: string | null;
  side: TTooltipSide;
  rect: DOMRect | null;
};

/**
 * The tooltip showing, if any. It is drawn in the page overlay, so a panel's edges never clip it.
 */
export const tooltipState: TTooltipState = $state({ text: null, side: "top", rect: null });

let owner: Element | null = null;

/**
 * Shows a tooltip next to an element.
 *
 * @param target - The element it is about.
 * @param text - What it says.
 * @param side - Which side of the element it shows on.
 */
export function showTooltip(target: Element, text: string, side: TTooltipSide): void {
  owner = target;
  tooltipState.text = text;
  tooltipState.side = side;
  tooltipState.rect = target.getBoundingClientRect();
}

/**
 * Hides the tooltip, or only the given element's.
 *
 * @param target - Hide only if the tooltip is this element's.
 */
export function hideTooltip(target?: Element): void {
  if (!target || target === owner) {
    owner = null;
    tooltipState.text = null;
    tooltipState.rect = null;
  }
}

/**
 * Gives an element a tooltip styled like Discord's, shown while it is hovered or focused from the
 * keyboard, and hidden when it is pressed.
 *
 * @param text - What the tooltip says.
 * @param side - Which side of the element it shows on.
 * @returns The attachment.
 */
export function tooltip(text: string, side: TTooltipSide = "top"): Attachment<HTMLElement> {
  return (node) => {
    const show = (): void => showTooltip(node, text, side);
    const showOnKeyboardFocus = (): void => {
      if (node.matches(":focus-visible")) {
        show();
      }
    };
    const hide = (): void => hideTooltip(node);

    node.addEventListener("pointerenter", show);
    node.addEventListener("pointerleave", hide);
    node.addEventListener("pointerdown", hide);
    node.addEventListener("focus", showOnKeyboardFocus);
    node.addEventListener("blur", hide);

    // Showing already: follow the new text, e.g. Favorite turning into Unfavorite.
    if (owner === node) {
      show();
    }

    return () => {
      node.removeEventListener("pointerenter", show);
      node.removeEventListener("pointerleave", hide);
      node.removeEventListener("pointerdown", hide);
      node.removeEventListener("focus", showOnKeyboardFocus);
      node.removeEventListener("blur", hide);

      // Torn down to update its text, the element stays; torn down for good, it is gone by then.
      queueMicrotask(() => {
        if (!node.isConnected) {
          hide();
        }
      });
    };
  };
}
