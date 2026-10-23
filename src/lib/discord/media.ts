import type { TItemType } from "~/lib/db/types";

import { SELECTORS } from "./selectors";



/**
 * Something in a Discord message that Nitfree can save: where its original file is, the item type it
 * makes, and its name, which for an image is its file name.
 */
export type TChatMedia = {
  url: string;
  type: TItemType;
  name: string;
};

const CDN = "https://cdn.discordapp.com";
const MEDIA_PROXY = "https://media.discordapp.net";

/**
 * Discord's sticker formats, from its API. Lottie stickers (3) are animations drawn in code, not images.
 */
const STICKER_FORMATS: Record<string, string> = { 1: "png", 2: "png", 4: "gif" };

/**
 * What Discord's media proxy adds to resize or convert an image; without them it serves the original.
 */
const PROXY_PARAMETERS = ["format", "width", "height", "quality", "size", "animated", "passthrough"];

function parse(url: string): URL | null {
  return URL.canParse(url) ? new URL(url) : null;
}

function isDiscordHost(url: URL): boolean {
  return url.hostname === "cdn.discordapp.com" || url.hostname.endsWith(".discordapp.net");
}

function fileName(url: URL): string {
  const last = url.pathname.split("/").at(-1)!;

  try {
    return decodeURIComponent(last);
  }
  catch {
    return last;
  }
}

function imageType(name: string): TItemType {
  return /\.gif$/i.test(name) ? "gif" : "image";
}

/**
 * A custom emoji, at its uploaded size: a GIF when animated, a PNG otherwise.
 *
 * @param id - The emoji's id.
 * @param alt - Its alternative text, `:name:` in messages.
 * @param src - The address it is shown from, which says whether it is animated.
 * @returns The emoji.
 */
export function emojiMedia(id: string, alt: string, src: string): TChatMedia {
  const url = parse(src);
  const animated = url?.searchParams.get("animated") === "true" || /\.gif$/i.test(url?.pathname ?? "");
  const name = alt.replace(/^:|:$/g, "").trim() || url?.searchParams.get("name") || "emoji";

  return { url: `${CDN}/emojis/${id}.${animated ? "gif" : "png"}`, type: "emoji", name };
}

/**
 * A sticker, at its full size and with its animation.
 *
 * @param id - The sticker's id.
 * @param name - Its name.
 * @param format - Its format number from Discord's API.
 * @returns The sticker, or null for a Lottie sticker, which is not an image.
 */
export function stickerMedia(id: string, name: string, format: string): TChatMedia | null {
  const extension = STICKER_FORMATS[format];

  return extension ? { url: `${MEDIA_PROXY}/stickers/${id}.${extension}`, type: "sticker", name: name.trim() || "sticker" } : null;
}

/**
 * An image attached to a message or shown in a link's embed, as originally uploaded.
 *
 * @param href - Where Discord links the image to: the original attachment, or the embedded page's image.
 * @param safeSrc - Discord's proxied copy, used when the link leaves Discord.
 * @returns The image, or null when neither address is Discord's.
 */
export function imageMedia(href: string, safeSrc: string): TChatMedia | null {
  const link = parse(href);

  // Attachment links are signed, so their query stays as it is.
  if (link && isDiscordHost(link) && /^\/(?:ephemeral-)?attachments\//.test(link.pathname)) {
    const url = new URL(link.pathname + link.search, CDN);

    for (const parameter of PROXY_PARAMETERS) {
      url.searchParams.delete(parameter);
    }

    return { url: url.href, type: imageType(fileName(url)), name: fileName(url) };
  }

  // Images from elsewhere come through Discord's proxy, which lets Nitfree read them.
  const proxied = parse(safeSrc);

  if (!proxied || !isDiscordHost(proxied)) {
    return null;
  }

  for (const parameter of PROXY_PARAMETERS) {
    proxied.searchParams.delete(parameter);
  }

  const name = (link && fileName(link)) || fileName(proxied);

  return { url: proxied.href, type: imageType(name), name };
}

/**
 * Reads what was right-clicked in a message: a custom emoji, a sticker, or an attached or embedded image.
 *
 * @param target - The element under the pointer.
 * @returns What it shows, or null when it is nothing Nitfree can save.
 */
export function findChatMedia(target: Element): TChatMedia | null {
  const emoji = target.closest<HTMLImageElement>(SELECTORS.chatEmoji.join(","));

  if (emoji) {
    return emojiMedia(emoji.dataset.id!, emoji.alt, emoji.currentSrc || emoji.src);
  }

  const sticker = target.closest<HTMLElement>(SELECTORS.chatSticker.join(","));

  if (sticker) {
    return stickerMedia(sticker.dataset.id!, sticker.dataset.name ?? "", sticker.dataset.formatType ?? "");
  }

  const image = target.closest<HTMLAnchorElement>(SELECTORS.chatImage.join(","));

  return image ? imageMedia(image.href, image.dataset.safeSrc ?? "") : null;
}
