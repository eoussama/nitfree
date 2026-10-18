import type { TThemeSnapshot } from "./tokens";

import { applyPalette } from "./palette";
import { themeSnapshot } from "./storage";
import { FALLBACK_PALETTES, REDUCED_MOTION_QUERY } from "./tokens";



/**
 * Styles an extension page with the last palette seen on Discord, following
 * the OS light or dark setting until a Discord tab has been opened.
 *
 * @param root - The page's root element.
 * @returns A function that stops following.
 */
export function followStoredTheme(root: HTMLElement): () => void {
  const colorScheme = matchMedia("(prefers-color-scheme: light)");
  const motion = matchMedia(REDUCED_MOTION_QUERY);
  let snapshot: TThemeSnapshot | null = null;

  const render = () => {
    const scheme = snapshot?.scheme ?? (colorScheme.matches ? "light" : "dark");
    const reducedMotion = motion.matches || (snapshot?.reducedMotion ?? false);

    applyPalette(root, snapshot?.palette ?? FALLBACK_PALETTES[scheme], reducedMotion);
    root.style.colorScheme = scheme;
  };

  const update = (value: TThemeSnapshot | null) => {
    snapshot = value;
    render();
  };

  render();
  void themeSnapshot.getValue().then(update);

  const unwatch = themeSnapshot.watch(update);

  colorScheme.addEventListener("change", render);
  motion.addEventListener("change", render);

  return () => {
    unwatch();
    colorScheme.removeEventListener("change", render);
    motion.removeEventListener("change", render);
  };
}
