const layers: (() => void)[] = [];

/**
 * Lets a small popup, such as the tag suggestions or the panel's filter menu, close first on Escape,
 * before the menu, the dialog or the panel around it.
 *
 * @param close - Closes the popup.
 * @returns A function that stops listening, once the popup is closed.
 */
export function onEscape(close: () => void): () => void {
  layers.push(close);

  return () => {
    const index = layers.lastIndexOf(close);

    if (index !== -1) {
      layers.splice(index, 1);
    }
  };
}

/**
 * Whether a popup is waiting to close on Escape.
 *
 * @returns Whether there is one.
 */
export function hasEscapeLayer(): boolean {
  return layers.length > 0;
}

/**
 * Closes the most recent popup that asked for Escape.
 *
 * @returns Whether there was one.
 */
export function escapeTop(): boolean {
  const close = layers.at(-1);

  close?.();

  return close !== undefined;
}
