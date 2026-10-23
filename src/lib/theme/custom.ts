import type { TColorTheme } from "./gradients";

import { BLURPLE_BASE, BLURPLE_SCALE } from "./blurple";
import { hexToRgb, rgbToHsl } from "./color";
import { colorThemeCss, THEME_CLASS } from "./gradients";



/**
 * A piece of CSS added to Discord, on or off.
 */
export type TSnippet = { id: string; name: string; css: string; enabled: boolean };

/**
 * An accent color as the popup's color picker gives it.
 */
export const ACCENT_PATTERN = /^#[\da-f]{6}$/i;

/**
 * How long a snippet's name and CSS can be.
 */
export const SNIPPET_NAME_MAX = 100;
export const SNIPPET_CSS_MAX = 100_000;

const STYLE_ATTRIBUTE = "data-nitfree-theme";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Reads a color's hue, saturation and lightness.
 *
 * @param hex - The color, as `#rrggbb`.
 * @returns Hue in degrees, saturation and lightness in percent; null for anything else.
 */
export function hexToHsl(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);

  if (!rgb) {
    return null;
  }

  const [hue, saturation, lightness] = rgbToHsl(rgb);

  return [round(hue), round(saturation * 100), round(lightness * 100)];
}

/**
 * Discord's blurple scale, turned to an accent color: its main step becomes the color, and the
 * others keep how much lighter, darker and less saturated they are than it, so hovers, pressed
 * states and light tints still read as Discord's.
 *
 * @param hex - The accent color, as `#rrggbb`.
 * @returns Each step's hue, saturation and lightness, from step 1; null for an invalid color.
 */
export function accentScale(hex: string): [number, number, number][] | null {
  const accent = hexToHsl(hex);
  const base = BLURPLE_SCALE[BLURPLE_BASE - 1];

  if (!accent || !base) {
    return null;
  }

  const [hue, saturation, lightness] = accent;
  const [, baseSaturation, baseLightness] = base;

  return BLURPLE_SCALE.map(([, s, l]) => [
    hue,
    round(Math.min(100, s * saturation / baseSaturation)),
    round(l >= baseLightness
      ? lightness + (l - baseLightness) * (100 - lightness) / (100 - baseLightness)
      : l * lightness / baseLightness),
  ]);
}

/**
 * The CSS that gives Discord an accent color. It redefines the blurple scale Discord's brand
 * colors read, keeping Discord's own saturation setting.
 *
 * @param hex - The accent color, as `#rrggbb`.
 * @returns The CSS, empty for an invalid color.
 */
export function accentCss(hex: string): string {
  const scale = accentScale(hex);

  if (!scale) {
    return "";
  }

  const steps = scale.map(([h, s, l], index) => `--blurple-${index + 1}-hsl: ${h} calc(var(--saturation-factor, 1) * ${s}%) ${l}%;`);

  // Twice as specific as Discord's own :root, wherever its stylesheets end up.
  return `:root:root {\n  ${steps.join("\n  ")}\n}`;
}

/**
 * How Discord is styled from Nitfree: a color theme, an accent color and CSS snippets, each null or
 * empty when not used.
 */
export type TCustomTheme = { colorTheme: TColorTheme | null; accent: string | null; snippets: readonly TSnippet[] };

/**
 * Adds what styles Discord from Nitfree, the color theme, then the accent color, then each snippet
 * that is on, and keeps them after Discord's own styles, which it keeps adding as it loads parts of
 * the app. A color theme also needs the class Discord's stylesheet styles color themes by on its
 * root: it is put back as soon as Discord resets the root's classes. Turning one off removes its
 * style, which puts Discord back as it was.
 *
 * @param document - Discord's document.
 * @returns The styles: render them, and remove them all once done.
 */
export function themeStyles(document: Document): { render: (theme: TCustomTheme) => void; stop: () => void } {
  const root = document.documentElement;
  let styles: HTMLStyleElement[] = [];
  let themed = false;
  // Whether the class is Nitfree's to take off again, rather than a Nitro theme's.
  let added = false;

  const sheet = (key: string, css: string): HTMLStyleElement => {
    const style = styles.find(found => found.getAttribute(STYLE_ATTRIBUTE) === key) ?? document.createElement("style");

    style.setAttribute(STYLE_ATTRIBUTE, key);

    if (style.textContent !== css) {
      style.textContent = css;
    }

    return style;
  };

  const place = (): void => {
    const { children } = document.head;
    const first = children.length - styles.length;

    // Already last, in order: nothing to move, which also keeps this from answering its own moves.
    if (styles.every((style, index) => children[first + index] === style)) {
      return;
    }

    document.head.append(...styles);
  };

  // Run before the page is drawn again, so a reset class never shows.
  const mark = (): void => {
    if (themed && !root.classList.contains(THEME_CLASS)) {
      root.classList.add(THEME_CLASS);
      added = true;
    }
    else if (!themed && added) {
      root.classList.remove(THEME_CLASS);
      added = false;
    }
  };

  const observer = new MutationObserver(place);
  const classes = new MutationObserver(mark);

  observer.observe(document.head, { childList: true });
  classes.observe(root, { attributes: true, attributeFilter: ["class"] });

  return {
    render({ colorTheme, accent, snippets }) {
      const next = [
        ...(colorTheme ? [sheet("colors", colorThemeCss(colorTheme))] : []),
        ...(accent && ACCENT_PATTERN.test(accent) ? [sheet("accent", accentCss(accent))] : []),
        ...snippets.filter(snippet => snippet.enabled).map(snippet => sheet(`snippet-${snippet.id}`, snippet.css)),
      ];

      for (const style of styles) {
        if (!next.includes(style)) {
          style.remove();
        }
      }

      styles = next;
      themed = colorTheme !== null;
      place();
      mark();
    },
    stop() {
      observer.disconnect();
      classes.disconnect();
      themed = false;
      mark();

      for (const style of styles) {
        style.remove();
      }

      styles = [];
    },
  };
}

/**
 * Adds snippets from a backup to the ones kept: a snippet already kept, by its id, takes the
 * backup's name, CSS and state.
 *
 * @param kept - The snippets kept.
 * @param imported - The backup's snippets.
 * @returns The snippets, the kept ones first.
 */
export function mergeSnippets(kept: readonly TSnippet[], imported: readonly TSnippet[]): TSnippet[] {
  const byId = new Map(imported.map(snippet => [snippet.id, snippet]));
  const merged = kept.map(snippet => byId.get(snippet.id) ?? snippet);
  const known = new Set(kept.map(snippet => snippet.id));

  return [...merged, ...imported.filter(snippet => !known.has(snippet.id))];
}
