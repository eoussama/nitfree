const KEY_EVENTS = ["keydown", "keyup", "keypress", "paste", "copy", "cut"] as const;
const POINTER_EVENTS = ["pointerdown", "mousedown", "click", "contextmenu"] as const;
const FOCUS_EVENTS = ["focusin", "focusout"] as const;

type TIsolateOptions = {
  pointer?: boolean;
  focus?: boolean;
};

/**
 * Keeps events inside a Nitfree host from reaching Discord's page listeners. Seen from the page, an
 * event in a shadow root comes from its host, a plain element, so Discord could treat typing or
 * pasting in Nitfree's fields as typing anywhere and move focus to its chat box, or upload a pasted
 * image to the channel. Escape always goes through, so Discord can still close its picker.
 *
 * @param host - The element holding a Nitfree shadow root.
 * @param options - Which events to keep in.
 * @param options.pointer - Also keep presses in, so Discord does not treat them as outside clicks.
 * @param options.focus - Also hide focus moving in and out of the host. Discord's open popouts, such
 * as the expression picker, lock focus (its focus-layers library): a capture listener on the document
 * pulls focus that lands outside them back in, which would make a dialog's fields impossible to type
 * in. These events are stopped on the window, which comes before the document.
 * @returns A function that stops isolating.
 */
export function isolate(host: HTMLElement, { pointer = false, focus = false }: TIsolateOptions = {}): () => void {
  const stop = (event: Event): void => {
    if (!(event instanceof KeyboardEvent && event.key === "Escape")) {
      event.stopPropagation();
    }
  };
  const hide = (event: Event): void => {
    if (event.composedPath().includes(host)) {
      event.stopImmediatePropagation();
    }
  };
  const types = [...KEY_EVENTS, ...(pointer ? POINTER_EVENTS : [])];

  for (const type of types) {
    host.addEventListener(type, stop);
  }

  if (focus) {
    for (const type of FOCUS_EVENTS) {
      window.addEventListener(type, hide, true);
    }
  }

  return () => {
    for (const type of types) {
      host.removeEventListener(type, stop);
    }

    for (const type of FOCUS_EVENTS) {
      window.removeEventListener(type, hide, true);
    }
  };
}
