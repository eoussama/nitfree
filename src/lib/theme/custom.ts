import { BLURPLE_BASE, BLURPLE_SCALE } from "./blurple";



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
  if (!ACCENT_PATTERN.test(hex)) {
    return null;
  }

  const [r, g, b] = [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return [0, 0, round(lightness * 100)];
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;

  return [round((hue * 60 + 360) % 360), round(Math.min(saturation, 1) * 100), round(lightness * 100)];
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
 * Adds what styles Discord from Nitfree, the accent color then each snippet that is on, and keeps
 * them after Discord's own styles, which it keeps adding as it loads parts of the app. Disabling
 * one removes its style, which puts Discord back as it was.
 *
 * @param document - Discord's document.
 * @returns The styles: render them, and remove them all once done.
 */
export function themeStyles(document: Document): { render: (accent: string | null, snippets: readonly TSnippet[]) => void; stop: () => void } {
  let styles: HTMLStyleElement[] = [];

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

  const observer = new MutationObserver(place);

  observer.observe(document.head, { childList: true });

  return {
    render(accent, snippets) {
      const next = [
        ...(accent && ACCENT_PATTERN.test(accent) ? [sheet("accent", accentCss(accent))] : []),
        ...snippets.filter(snippet => snippet.enabled).map(snippet => sheet(`snippet-${snippet.id}`, snippet.css)),
      ];

      for (const style of styles) {
        if (!next.includes(style)) {
          style.remove();
        }
      }

      styles = next;
      place();
    },
    stop() {
      observer.disconnect();

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
