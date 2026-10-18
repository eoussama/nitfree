import type { TThemeSnapshot } from "./tokens";

import { detectTheme, isReducedMotion, readPalette, schemeOf } from "./palette";
import { REDUCED_MOTION_QUERY } from "./tokens";



/**
 * Reads Discord's current theme from the page.
 *
 * @param root - Discord's root element.
 * @returns The theme, palette and motion preference in use.
 */
export function readTheme(root: HTMLElement): TThemeSnapshot {
  const classes = root.classList;
  const theme = detectTheme(classes);
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
 *
 * @param root - Discord's root element.
 * @param onChange - Called with the new theme whenever it differs from the last one.
 * @returns A function that stops watching.
 */
export function watchTheme(root: HTMLElement, onChange: (snapshot: TThemeSnapshot) => void): () => void {
  let last = "";
  let frame = 0;

  const update = () => {
    frame = 0;

    const snapshot = readTheme(root);
    const serialized = JSON.stringify(snapshot);

    if (serialized !== last) {
      last = serialized;
      onChange(snapshot);
    }
  };

  const schedule = () => {
    frame ||= requestAnimationFrame(update);
  };

  // Theme switches change classes on <html>; client themes also inject styles into <head>.
  const observer = new MutationObserver(schedule);

  observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
  observer.observe(document.head, { childList: true });

  const motion = matchMedia(REDUCED_MOTION_QUERY);

  motion.addEventListener("change", schedule);

  update();

  return () => {
    observer.disconnect();
    motion.removeEventListener("change", schedule);
    cancelAnimationFrame(frame);
  };
}
