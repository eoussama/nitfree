import type { TThemeSnapshot } from "./tokens";



/**
 * The last palette seen on Discord, so the popup can match it.
 */
export const themeSnapshot = storage.defineItem<TThemeSnapshot | null>("local:theme", { fallback: null });
