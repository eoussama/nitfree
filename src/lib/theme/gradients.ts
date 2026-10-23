import type { THsl, TRgb } from "./color";
import type { TScheme } from "./tokens";

import { hexToRgb, hslToRgb, luminance, rgbToHsl } from "./color";



/**
 * A color theme: a gradient behind Discord, with its colors blended into Discord's surfaces and
 * text, as Nitro's color themes are. Each is made for Discord's light or dark themes.
 */
export type TColorTheme = { id: TColorThemeId; scheme: TScheme; angle: number; colors: readonly string[] };

export type TColorThemeId = typeof COLOR_THEMES[number]["id"];

/**
 * The class Discord gives its root while a color theme is on, which its stylesheet styles.
 */
export const THEME_CLASS = "custom-theme-background";

/**
 * Nitfree's color themes, light ones first.
 */
export const COLOR_THEMES = [
  { id: "peach", scheme: "light", angle: 135, colors: ["#ffecd2", "#fcb69f"] },
  { id: "mint", scheme: "light", angle: 150, colors: ["#e3fdd0", "#a8e6cf"] },
  { id: "lavender", scheme: "light", angle: 160, colors: ["#e0c3fc", "#a9c9fb"] },
  { id: "lemon", scheme: "light", angle: 120, colors: ["#fdf6c3", "#f9d29d"] },
  { id: "cotton", scheme: "light", angle: 135, colors: ["#fbc2eb", "#c6d4f5"] },
  { id: "seaglass", scheme: "light", angle: 170, colors: ["#c2e9fb", "#b7f2d8"] },
  { id: "ocean", scheme: "dark", angle: 160, colors: ["#0f2027", "#203a43", "#2c5364"] },
  { id: "ember", scheme: "dark", angle: 150, colors: ["#1f0a0a", "#5c1a1a", "#8a3b12"] },
  { id: "nebula", scheme: "dark", angle: 135, colors: ["#120c2c", "#3a1c71", "#6b2a8a"] },
  { id: "aurora", scheme: "dark", angle: 165, colors: ["#0b1d26", "#0f4c45", "#2a7a5e"] },
  { id: "rose", scheme: "dark", angle: 145, colors: ["#1a0f1f", "#4a1942", "#7a284f"] },
  { id: "forest", scheme: "dark", angle: 175, colors: ["#0e1a12", "#1f3b2a", "#3d5a3c"] },
  { id: "synthwave", scheme: "dark", angle: 135, colors: ["#1b1036", "#6a1b9a", "#c2185b"] },
  { id: "graphite", scheme: "dark", angle: 155, colors: ["#161616", "#3a3226", "#6b5a2e"] },
] as const satisfies readonly { id: string; scheme: TScheme; angle: number; colors: readonly string[] }[];

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function css(hsl: THsl): string {
  return `rgb(${hslToRgb(hsl).join(", ")})`;
}

function hslText([hue, saturation, lightness]: THsl): string {
  return `${round(hue)} ${round(saturation * 100)}% ${round(lightness * 100)}%`;
}

/**
 * The colors Discord blends into its surfaces and text for a theme, worked out as Discord does from
 * the gradient's first and last colors: surfaces take the darker one in dark themes and the lighter
 * one in light themes, and text the other, fully saturated.
 *
 * @param first - The gradient's first color.
 * @param last - The gradient's last color.
 * @param dark - Whether for Discord's dark themes.
 * @returns The surface and text colors.
 */
export function blendColors(first: TRgb, last: TRgb, dark: boolean): { base: THsl; text: THsl } {
  const [lighter, darker] = luminance(first) > luminance(last) ? [first, last] : [last, first];
  const light = rgbToHsl(lighter);
  let deep = rgbToHsl(darker);

  // A gray has no hue to lend, so the other color's is taken.
  if (deep[0] === 0) {
    deep = light;
  }

  const [hue] = dark ? light : deep;
  // Blues and purples need more contrast to read.
  const text: THsl = [hue, 1, hue >= 200 && hue <= 300 ? (dark ? 0.8 : 0.25) : (dark ? 0.95 : 0.15)];

  return { base: dark ? [deep[0], 1, 0.05] : [light[0], 1, 0.9], text };
}

/**
 * The CSS that puts a color theme on Discord, in the variables Discord's own stylesheet reads for
 * Nitro's color themes, while its root has {@link THEME_CLASS}.
 *
 * @param theme - The theme.
 * @returns The CSS.
 */
export function colorThemeCss(theme: TColorTheme): string {
  const first = hexToRgb(theme.colors[0] ?? "") ?? [0, 0, 0];
  const last = hexToRgb(theme.colors.at(-1) ?? "") ?? first;
  const stops = theme.colors.length === 1 ? [theme.colors[0], theme.colors[0]] : theme.colors;
  const dark = blendColors(first, last, true);
  const light = blendColors(first, last, false);

  const variables = {
    "--custom-theme-background": `linear-gradient(${theme.angle}deg, ${stops.join(", ")})`,
    "--custom-theme-primary-color": theme.colors[0],
    "--custom-theme-secondary-color": theme.colors.at(-1),
    "--custom-background-gradient-opacity-multiplier": "1",
    "--custom-theme-base-color-amount": "50%",
    "--custom-theme-text-color-amount": "38%",
    "--custom-theme-base-color-light-hsl": hslText(light.base),
    "--custom-theme-base-color-light": css(light.base),
    "--custom-theme-text-color-light": css(light.text),
    "--custom-theme-base-color-dark-hsl": hslText(dark.base),
    "--custom-theme-base-color-dark": css(dark.base),
    "--custom-theme-text-color-dark": css(dark.text),
  };

  // More specific than Discord's own rule, so it wins over a Nitro theme too.
  return `html.${THEME_CLASS} {\n  ${Object.entries(variables).map(([name, value]) => `${name}: ${value};`).join("\n  ")}\n}`;
}

/**
 * Finds a color theme.
 *
 * @param id - Its id, as kept in the settings.
 * @returns The theme, or null for none or one that no longer exists.
 */
export function findColorTheme(id: string | null): TColorTheme | null {
  return COLOR_THEMES.find(theme => theme.id === id) ?? null;
}
