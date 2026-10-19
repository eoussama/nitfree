export type TSendSizes = {
  emoji: number;
  sticker: number;
};

/**
 * Discord shows emojis in chat at 48 px and stickers at 160 px.
 */
export const DEFAULT_SEND_SIZES: TSendSizes = { emoji: 48, sticker: 160 };

/**
 * The longest side, in pixels, emojis and stickers are sent at.
 */
export const sendSizes = storage.defineItem<TSendSizes>("local:sendSizes", { fallback: DEFAULT_SEND_SIZES });
