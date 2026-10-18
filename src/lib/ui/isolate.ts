const KEY_EVENTS = ["keydown", "keyup", "keypress", "paste", "copy", "cut"] as const;
const POINTER_EVENTS = ["pointerdown", "mousedown", "click", "contextmenu"] as const;

/**
 * Keeps events inside a Nitfree host from reaching Discord's page listeners. Seen from the page, an
 * event in a shadow root comes from its host, a plain element, so Discord could treat typing or
 * pasting in Nitfree's fields as typing anywhere and move focus to its chat box, or upload a pasted
 * image to the channel. Escape always goes through, so
 * Discord can still close its picker.
 *
 * @param host - The element holding a Nitfree shadow root.
 * @param options - Which events to keep in.
 * @param options.pointer - Also keep presses in, so Discord does not treat them as outside clicks.
 * @returns A function that stops isolating.
 */
export function isolate(host: HTMLElement, { pointer = false }: { pointer?: boolean } = {}): () => void {
  const stop = (event: Event): void => {
    if (!(event instanceof KeyboardEvent && event.key === "Escape")) {
      event.stopPropagation();
    }
  };
  const types = [...KEY_EVENTS, ...(pointer ? POINTER_EVENTS : [])];

  for (const type of types) {
    host.addEventListener(type, stop);
  }

  return () => {
    for (const type of types) {
      host.removeEventListener(type, stop);
    }
  };
}
