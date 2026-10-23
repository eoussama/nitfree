/**
 * A key combination: one key, and the modifiers held with it.
 */
export type TShortcut = {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

type TKeyEvent = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

/**
 * Ctrl+Alt+N opens the panel by default: Discord gives Ctrl+Alt only to arrows, I and Shift+W, and
 * neither Chrome nor Firefox use it.
 */
export const DEFAULT_SHORTCUT: TShortcut = { key: "N", ctrl: true, alt: true, shift: false, meta: false };

const MODIFIERS = new Set(["Control", "Alt", "AltGraph", "Shift", "Meta", "OS", "Hyper", "Super", "Fn", "FnLock", "CapsLock", "NumLock", "ScrollLock", "Symbol", "SymbolLock"]);
const UNNAMED = new Set(["Dead", "Unidentified", "Process"]);

/**
 * Names the key pressed, the same way whatever the keyboard layout and modifiers: a letter as the
 * layout prints it, and otherwise by its place on the keyboard, so Shift+1 is still 1 and Option+N on
 * a Mac, which starts an accent, is still N.
 *
 * @param event - The key press.
 * @returns The key's name, or null for a modifier on its own.
 */
export function keyOf(event: Pick<KeyboardEvent, "key" | "code">): string | null {
  if (MODIFIERS.has(event.key)) {
    return null;
  }

  if (/^[a-z]$/i.test(event.key)) {
    return event.key.toUpperCase();
  }

  const physical = /^(?:Key([A-Z])|Digit(\d))$/.exec(event.code);

  if (physical) {
    return physical[1] ?? physical[2]!;
  }

  if (event.key === " ") {
    return "Space";
  }

  if (UNNAMED.has(event.key)) {
    return null;
  }

  return event.key.length === 1 ? event.key.toUpperCase() : event.key;
}

/**
 * Reads the combination a key press makes.
 *
 * @param event - The key press.
 * @returns The combination, or null while only modifiers are held.
 */
export function shortcutOf(event: TKeyEvent): TShortcut | null {
  const key = keyOf(event);

  return key ? { key, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey } : null;
}

/**
 * Whether a combination can open the panel without getting in the way of typing: it needs Ctrl, Alt
 * or Command (Windows key elsewhere), as Shift alone types capitals.
 *
 * @param shortcut - The combination.
 * @returns Whether it can be used.
 */
export function isUsableShortcut(shortcut: TShortcut): boolean {
  return shortcut.ctrl || shortcut.alt || shortcut.meta;
}

/**
 * Whether a key press is the given combination, with exactly its modifiers.
 *
 * @param event - The key press.
 * @param shortcut - The combination.
 * @returns Whether it matches.
 */
export function matchesShortcut(event: TKeyEvent, shortcut: TShortcut): boolean {
  return event.ctrlKey === shortcut.ctrl
    && event.altKey === shortcut.alt
    && event.shiftKey === shortcut.shift
    && event.metaKey === shortcut.meta
    && keyOf(event) === shortcut.key;
}

/**
 * Whether this is a Mac, where modifiers are shown as symbols.
 *
 * @returns Whether it is.
 */
export function isMac(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData;

  return /mac/i.test(data?.platform ?? navigator.platform);
}

/**
 * The keys of a combination as they are printed, in the order each system lists them.
 *
 * @param shortcut - The combination.
 * @param mac - Whether to name them as a Mac does.
 * @returns One name per key.
 */
export function shortcutKeys(shortcut: TShortcut, mac: boolean = isMac()): string[] {
  const modifiers = mac
    ? [shortcut.ctrl && "⌃", shortcut.alt && "⌥", shortcut.shift && "⇧", shortcut.meta && "⌘"]
    : [shortcut.ctrl && "Ctrl", shortcut.alt && "Alt", shortcut.shift && "Shift", shortcut.meta && "Win"];

  return [...modifiers.filter(name => typeof name === "string"), shortcut.key];
}

/**
 * A combination as `aria-keyshortcuts` names it, for screen readers.
 *
 * @param shortcut - The combination.
 * @returns The value, such as "Alt+N".
 */
export function ariaShortcut(shortcut: TShortcut): string {
  const modifiers = [shortcut.ctrl && "Control", shortcut.alt && "Alt", shortcut.shift && "Shift", shortcut.meta && "Meta"];

  return [...modifiers.filter(name => typeof name === "string"), shortcut.key].join("+");
}

/**
 * A combination as one line of text, such as "Alt+N", or "⌥N" on a Mac.
 *
 * @param shortcut - The combination.
 * @param mac - Whether to name it as a Mac does.
 * @returns The text.
 */
export function formatShortcut(shortcut: TShortcut, mac: boolean = isMac()): string {
  return shortcutKeys(shortcut, mac).join(mac ? "" : "+");
}
