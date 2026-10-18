import type { TPalette, TPaletteToken, TScheme, TThemeName } from "./tokens";

import { DISCORD_VARIABLES, FALLBACK_PALETTES, THEME_NAMES, TOKEN_VARIABLES } from "./tokens";



/**
 * Finds Discord's theme from the classes on `<html>`.
 *
 * @param classes - The class names on Discord's root element.
 * @returns The theme in use, dark when none is found.
 */
export function detectTheme(classes: Iterable<string>): TThemeName {
  const names = new Set(classes);

  return THEME_NAMES.find(name => names.has(`theme-${name}`)) ?? "dark";
}

/**
 * Tells whether a theme is light or dark.
 *
 * @param theme - A Discord theme.
 * @returns The theme's color scheme.
 */
export function schemeOf(theme: TThemeName): TScheme {
  return theme === "light" ? "light" : "dark";
}

/**
 * Tells whether animation should be off, from the OS or from Discord's own setting.
 *
 * @param classes - The class names on Discord's root element.
 * @param prefersReducedMotion - Whether the OS asks for reduced motion.
 * @returns Whether animation should be turned off.
 */
export function isReducedMotion(classes: Iterable<string>, prefersReducedMotion: boolean): boolean {
  return prefersReducedMotion || new Set(classes).has("reduce-motion");
}

/**
 * Maps Discord's design tokens onto Nitfree's palette.
 *
 * @param read - Returns the computed value of a CSS variable, empty when unset.
 * @param scheme - The scheme whose defaults fill unreadable tokens.
 * @returns The palette.
 */
export function readPalette(read: (variable: string) => string, scheme: TScheme): TPalette {
  const fallback = FALLBACK_PALETTES[scheme];
  const tokens = Object.keys(DISCORD_VARIABLES) as TPaletteToken[];

  return Object.fromEntries(tokens.map((token) => {
    const value = DISCORD_VARIABLES[token].map(variable => read(variable).trim()).find(Boolean);

    return [token, value ?? fallback[token]];
  })) as TPalette;
}

/**
 * Exposes a palette as Nitfree's CSS variables on an element.
 *
 * @param target - The element the variables are set on; descendants and shadow roots inherit them.
 * @param palette - The palette to apply.
 * @param reducedMotion - Whether animation should be turned off.
 */
export function applyPalette(target: Pick<HTMLElement, "dataset" | "style">, palette: TPalette, reducedMotion: boolean): void {
  for (const [token, variable] of Object.entries(TOKEN_VARIABLES)) {
    target.style.setProperty(variable, palette[token as TPaletteToken]);
  }

  target.dataset.nfReducedMotion = String(reducedMotion);
}
