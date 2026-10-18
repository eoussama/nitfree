export type TScheme = "light" | "dark";

export type TThemeName = "light" | "dark" | "darker" | "midnight" | "ash" | "onyx";

export type TPalette = {
  bg: string;
  bgElevated: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  radius: string;
};

export type TPaletteToken = keyof TPalette;

export type TThemeSnapshot = {
  theme: TThemeName;
  scheme: TScheme;
  palette: TPalette;
  reducedMotion: boolean;
};

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Discord's themes, most specific first, since a darker theme also carries the dark class.
 */
export const THEME_NAMES: readonly TThemeName[] = ["onyx", "midnight", "darker", "ash", "dark", "light"];

/**
 * The CSS variable Nitfree components read for each token.
 */
export const TOKEN_VARIABLES: Record<TPaletteToken, string> = {
  bg: "--nf-bg",
  bgElevated: "--nf-bg-elevated",
  text: "--nf-text",
  muted: "--nf-muted",
  accent: "--nf-accent",
  border: "--nf-border",
  radius: "--nf-radius",
};

/**
 * Discord's variables for each token, newest naming first.
 */
export const DISCORD_VARIABLES: Record<TPaletteToken, readonly string[]> = {
  bg: ["--background-base-lower", "--background-primary"],
  bgElevated: ["--background-surface-high", "--background-floating", "--background-secondary"],
  text: ["--text-default", "--text-normal"],
  muted: ["--text-muted"],
  accent: ["--brand-500", "--brand-experiment"],
  border: ["--border-subtle", "--background-modifier-accent"],
  radius: ["--radius-md", "--radius-sm"],
};

/**
 * Discord's default light and dark values, used when a variable cannot be read.
 */
export const FALLBACK_PALETTES: Record<TScheme, TPalette> = {
  dark: {
    bg: "#313338",
    bgElevated: "#2b2d31",
    text: "#dbdee1",
    muted: "#949ba4",
    accent: "#5865f2",
    border: "#3f4147",
    radius: "8px",
  },
  light: {
    bg: "#ffffff",
    bgElevated: "#f2f3f5",
    text: "#313338",
    muted: "#5c5e66",
    accent: "#5865f2",
    border: "#e3e5e8",
    radius: "8px",
  },
};
