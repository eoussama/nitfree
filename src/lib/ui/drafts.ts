import type { TItemType, TTag } from "~/lib/db";
import type { TImageInfo } from "~/lib/media";



/**
 * What the file picker offers for an item's file; the background checks the actual bytes again when saving.
 */
export const ACCEPTED_IMAGES = ".png,.apng,.jpg,.jpeg,.jfif,.gif,.webp,image/png,image/apng,image/jpeg,image/gif,image/webp";

/**
 * What the file picker offers when adding: images, and videos to turn into GIFs.
 */
export const ACCEPTED_FILES = `${ACCEPTED_IMAGES},.mp4,.m4v,.webm,video/mp4,video/webm`;

const ACCEPTED_TYPES = new Set(["image/png", "image/apng", "image/jpeg", "image/gif", "image/webp"]);
const ACCEPTED_EXTENSIONS = /\.(?:a?png|jpe?g|jfif|gif|webp)$/i;

const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const VIDEO_EXTENSIONS = /\.(?:mp4|m4v|webm)$/i;

/**
 * Discord shows emojis up to this size and stickers up to the next.
 */
const EMOJI_MAX = 128;
const STICKER_MAX = 320;

/**
 * Whether a file looks like an image Nitfree accepts, before reading it.
 *
 * @param file - A picked, dropped or pasted file.
 * @returns Whether to keep it.
 */
export function isAcceptedFile(file: Pick<File, "name" | "type">): boolean {
  return ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.test(file.name);
}

/**
 * Whether a file looks like a video Nitfree can turn into a GIF, before reading it.
 *
 * @param file - A picked, dropped or pasted file.
 * @returns Whether it is an MP4 or WebM video.
 */
export function isVideoFile(file: Pick<File, "name" | "type">): boolean {
  return VIDEO_TYPES.has(file.type) || VIDEO_EXTENSIONS.test(file.name);
}

/**
 * Turns a file name into an item title: no extension, words joined with underscores, as in Discord's
 * `:emoji_names:`.
 *
 * @param name - The file name.
 * @returns The title, or "untitled" when nothing is left.
 */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const title = base.trim().replace(/[\s\-.]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

  return title || "untitled";
}

/**
 * Picks a sensible type from an image's size and animation: small images are emojis, medium ones
 * stickers, large animated GIFs GIFs, the rest images. The user can change it.
 *
 * @param info - What was read from the file, or null when it could not be read.
 * @returns The type.
 */
export function guessItemType(info: Pick<TImageInfo, "width" | "height" | "animated" | "format"> | null): TItemType {
  if (!info) {
    return "image";
  }

  const longest = Math.max(info.width, info.height);

  if (longest <= EMOJI_MAX) {
    return "emoji";
  }

  if (longest <= STICKER_MAX) {
    return "sticker";
  }

  return info.animated && info.format === "gif" ? "gif" : "image";
}

/**
 * The type of a GIF made from a video: a sticker up to a sticker's size, else a GIF. The user can change it.
 *
 * @param info - What was read from the GIF.
 * @returns The type.
 */
export function videoItemType(info: Pick<TImageInfo, "width" | "height">): TItemType {
  return Math.max(info.width, info.height) <= STICKER_MAX ? "sticker" : "gif";
}

/**
 * A tag or a pack: what a name field picks from.
 */
export type TNamed = Pick<TTag, "id" | "name">;

/**
 * Splits what was typed in a tag or pack field into names.
 *
 * @param input - Names separated by commas.
 * @returns The trimmed, non-empty names, without duplicates (regardless of case).
 */
export function parseTagNames(input: string): string[] {
  const names = input.split(",").map(name => name.trim().replace(/\s+/g, " ")).filter(Boolean);
  const seen = new Set<string>();

  return names.filter((name) => {
    const key = name.toLocaleLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

/**
 * Matches tag or pack names against the existing ones.
 *
 * @param names - The names chosen for an item.
 * @param tags - The library's tags, or its packs.
 * @returns The ids of names that already exist, and the names that need creating.
 */
export function resolveTagNames(names: readonly string[], tags: readonly TNamed[]): { ids: string[]; missing: string[] } {
  const byKey = new Map(tags.map(tag => [tag.name.toLocaleLowerCase(), tag.id]));
  const ids: string[] = [];
  const missing: string[] = [];

  for (const name of names) {
    const id = byKey.get(name.toLocaleLowerCase());

    if (id) {
      ids.push(id);
    }
    else {
      missing.push(name);
    }
  }

  return { ids, missing };
}

/**
 * Suggests existing tags or packs for what is being typed, those starting with it first.
 *
 * @param query - What has been typed so far.
 * @param tags - The library's tags, or its packs.
 * @param chosen - Names already chosen, left out of the suggestions.
 * @param limit - How many to suggest.
 * @returns The suggestions.
 */
export function suggestTags<T extends TNamed>(query: string, tags: readonly T[], chosen: readonly string[], limit = 6): T[] {
  const needle = query.trim().toLocaleLowerCase();
  const taken = new Set(chosen.map(name => name.toLocaleLowerCase()));
  const available = tags.filter(tag => !taken.has(tag.name.toLocaleLowerCase()));

  if (!needle) {
    return available.slice(0, limit);
  }

  const starts = available.filter(tag => tag.name.toLocaleLowerCase().startsWith(needle));
  const contains = available.filter(tag => !starts.includes(tag) && tag.name.toLocaleLowerCase().includes(needle));

  return [...starts, ...contains].slice(0, limit);
}
