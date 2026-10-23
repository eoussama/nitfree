import type { TShortcut } from "./shortcut";

import { DEFAULT_SHORTCUT } from "./shortcut";



export type TSendSizes = {
  emoji: number;
  sticker: number;
};

/**
 * What a plain click on an item does; Shift+click does the other.
 */
export type TClickAction = "send" | "add";

/**
 * Discord shows emojis in chat at 48 px and stickers at 160 px.
 */
export const DEFAULT_SEND_SIZES: TSendSizes = { emoji: 48, sticker: 160 };

/**
 * The sizes the popup accepts, in pixels.
 */
export const SEND_SIZE_LIMITS: Record<keyof TSendSizes, { min: number; max: number }> = {
  emoji: { min: 16, max: 160 },
  sticker: { min: 64, max: 320 },
};

/**
 * The longest side, in pixels, emojis and stickers are sent at.
 */
export const sendSizes = storage.defineItem<TSendSizes>("local:sendSizes", { fallback: DEFAULT_SEND_SIZES });

/**
 * Whether a click sends the item at once or adds it to the message being written.
 */
export const clickAction = storage.defineItem<TClickAction>("local:clickAction", { fallback: "send" });

/**
 * Whether animated items play in the panel while hovered or focused; off, they stay still.
 */
export const playAnimations = storage.defineItem<boolean>("local:playAnimations", { fallback: true });

/**
 * Whether typing `:name` in Discord's message box suggests Nitfree emojis.
 */
export const autocomplete = storage.defineItem<boolean>("local:autocomplete", { fallback: true });

/**
 * Where the suggested items go in Discord's autocomplete: after its own emojis, or before them.
 */
export type TSuggestionsAt = "end" | "start";

export const suggestionsAt = storage.defineItem<TSuggestionsAt>("local:suggestionsAt", { fallback: "end" });

/**
 * Whether a key combination opens the panel from Discord, and which one.
 */
export const shortcut = storage.defineItem<boolean>("local:shortcut", { fallback: true });

export const shortcutKeys = storage.defineItem<TShortcut>("local:shortcutKeys", { fallback: DEFAULT_SHORTCUT });

/**
 * Whether a pick sends the item, given how it was made and what a plain click is set to do.
 *
 * @param primary - True for a plain click or Enter, false with Shift.
 * @param action - What a plain click does.
 * @returns Whether to send.
 */
export function picksSend(primary: boolean, action: TClickAction): boolean {
  return action === "send" ? primary : !primary;
}

/**
 * Brings a typed size within the accepted range, as a whole number.
 *
 * @param kind - Emoji or sticker.
 * @param value - The typed size.
 * @returns The size to keep, or null when nothing usable was typed.
 */
export function clampSendSize(kind: keyof TSendSizes, value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  const { min, max } = SEND_SIZE_LIMITS[kind];

  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * Brings both sending sizes within range, such as sizes read from an imported backup.
 *
 * @param sizes - The sizes to check.
 * @returns The sizes to keep; one that is not a number falls back to the default.
 */
export function fitSendSizes(sizes: TSendSizes): TSendSizes {
  return {
    emoji: clampSendSize("emoji", sizes.emoji) ?? DEFAULT_SEND_SIZES.emoji,
    sticker: clampSendSize("sticker", sizes.sticker) ?? DEFAULT_SEND_SIZES.sticker,
  };
}
