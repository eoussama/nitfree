const layers: (() => void)[] = [];

/**
 * Lets a small popup inside the overlay, such as the tag suggestions, close first on Escape, before
 * the menu or the dialog around it.
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
 * Closes the most recent popup that asked for Escape.
 *
 * @returns Whether there was one.
 */
export function escapeTop(): boolean {
  const close = layers.at(-1);

  close?.();

  return close !== undefined;
}
