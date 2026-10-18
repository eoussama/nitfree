import type { TThemeSnapshot } from "./tokens";

import { detectTheme, isReducedMotion, readPalette, schemeOf } from "./palette";
import { REDUCED_MOTION_QUERY } from "./tokens";



/**
 * Reads Discord's current theme from the page.
 *
 * @param root - Discord's root element.
 * @returns The theme, palette and motion preference in use, or null when the page has no Discord theme.
 */
export function readTheme(root: HTMLElement): TThemeSnapshot | null {
  const classes = root.classList;
  const theme = detectTheme(classes);

  if (!theme) {
    return null;
  }

  const scheme = schemeOf(theme);
  const style = getComputedStyle(root);

  return {
    theme,
    scheme,
    palette: readPalette(variable => style.getPropertyValue(variable), scheme),
    reducedMotion: isReducedMotion(classes, matchMedia(REDUCED_MOTION_QUERY).matches),
  };
}

/**
 * Follows Discord's theme, calling back now and on every change, without a reload.
 * Pages without a Discord theme are ignored until one appears.
 *
 * @param root - Discord's root element.
 * @param onChange - Called with the new theme whenever it differs from the last one.
 * @returns A function that stops watching.
 */
export function watchTheme(root: HTMLElement, onChange: (snapshot: TThemeSnapshot) => void): () => void {
  let last = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const update = () => {
    timer = undefined;

    const snapshot = readTheme(root);

    if (!snapshot) {
      return;
    }

    const serialized = JSON.stringify(snapshot);

    if (serialized !== last) {
      last = serialized;
      onChange(snapshot);
    }
  };

  // A timer rather than an animation frame, so background tabs still pick up changes.
  const schedule = () => {
    timer ??= setTimeout(update, 16);
  };

  // Stylesheets apply only once loaded, which no mutation reports.
  const onLoad = (event: Event) => {
    if (event.target instanceof HTMLLinkElement || event.target instanceof HTMLStyleElement) {
      schedule();
    }
  };

  // Theme switches change classes on <html>; client themes add or edit styles in <head>.
  const observer = new MutationObserver(schedule);

  observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  document.addEventListener("load", onLoad, true);

  const motion = matchMedia(REDUCED_MOTION_QUERY);

  motion.addEventListener("change", schedule);

  update();

  return () => {
    observer.disconnect();
    document.removeEventListener("load", onLoad, true);
    motion.removeEventListener("change", schedule);
    clearTimeout(timer);
  };
}
