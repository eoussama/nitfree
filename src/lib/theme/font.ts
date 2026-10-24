import { tryCatch, tryCatchSync } from "@eoussama/core";

import { fromBase64, toBase64 } from "~/lib/messaging/codec";



/**
 * Discord's typeface, as its stylesheets name it.
 */
export const DISCORD_FONT = "gg sans";

/**
 * The weights the popup uses; Discord's other weights and its italics are left out.
 */
const WEIGHTS = new Set(["400", "500", "600", "700"]);

/**
 * At most this many bytes of font files are kept, in case Discord's stylesheets ever list far more than expected.
 */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * One of Discord's font files: where Discord serves it from, and its weight and character range.
 */
export type TFontFace = {
  url: string;
  weight: string;
  unicodeRange: string;
};

/**
 * Discord's font files, kept so the popup can use them without reaching Discord.
 */
export type TStoredFont = {
  faces: Array<TFontFace & { data: string }>;
};

/**
 * The copy of Discord's typeface kept for the popup.
 */
export const discordFont = storage.defineItem<TStoredFont | null>("local:discordFont", { fallback: null });

function unquote(value: string): string {
  return value.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

/**
 * Reads what one function in a `src` entry holds, such as the address in `url(...)`.
 *
 * @param entry - One entry of a `src` descriptor.
 * @param name - The function's name.
 * @returns Its argument without quotes, or an empty string.
 */
function argumentOf(entry: string, name: string): string {
  const start = entry.indexOf(`${name}(`);
  const end = entry.indexOf(")", start);

  return start === -1 || end === -1 ? "" : unquote(entry.slice(start + name.length + 1, end));
}

/**
 * Picks a face's file, preferring WOFF2.
 *
 * @param src - The face's `src` descriptor.
 * @param base - What relative URLs are relative to.
 * @returns The file's absolute URL, or null when it has none Nitfree can use.
 */
export function pickFontUrl(src: string, base: string): string | null {
  // Discord's font addresses have no commas of their own; a data URI, which has one, falls apart and is
  // dropped, as it would be anyway.
  const urls = src.split(",")
    .map(entry => ({ url: argumentOf(entry, "url"), format: argumentOf(entry, "format").toLowerCase() }))
    .filter(({ url }) => url);
  const best = urls.find(({ format, url }) => format === "woff2" || url.endsWith(".woff2")) ?? urls[0];

  // Stryker disable next-line ConditionalExpression,BlockStatement: reading the address of none fails just below, with the same result.
  if (!best) {
    return null;
  }

  const [error, url] = tryCatchSync(() => new URL(best.url, base));

  return error || (url.protocol !== "https:" && url.protocol !== "http:") ? null : url.href;
}

/**
 * Finds Discord's typeface in the page's stylesheets, in the weights the popup uses.
 *
 * @param sheets - The page's stylesheets.
 * @param base - What relative URLs are relative to when a sheet has no address of its own.
 * @returns The faces, in the order the page lists them.
 */
export function findFontFaces(sheets: Iterable<CSSStyleSheet>, base: string): TFontFace[] {
  const faces: TFontFace[] = [];
  const seen = new Set<string>();

  for (const sheet of sheets) {
    // Stylesheets from other sites cannot be read, and Discord's own font is not in them.
    const [error, rules] = tryCatchSync(() => [...sheet.cssRules]);

    if (error) {
      continue;
    }

    for (const rule of rules) {
      if (!(rule instanceof CSSFontFaceRule)) {
        continue;
      }

      const { style } = rule;
      const weight = style.getPropertyValue("font-weight").trim() || "400";
      const italic = /italic|oblique/.test(style.getPropertyValue("font-style"));

      if (unquote(style.getPropertyValue("font-family")).toLowerCase() !== DISCORD_FONT || italic || !WEIGHTS.has(weight)) {
        continue;
      }

      const url = pickFontUrl(style.getPropertyValue("src"), sheet.href ?? base);

      if (url && !seen.has(url)) {
        seen.add(url);
        faces.push({ url, weight, unicodeRange: style.getPropertyValue("unicode-range").trim() });
      }
    }
  }

  return faces;
}

function sameFaces(a: readonly TFontFace[], b: readonly TFontFace[]): boolean {
  // Stryker disable next-line OptionalChaining: both lists are as long, so every face has its match.
  return a.length === b.length && a.every((face, i) => face.url === b[i]?.url && face.weight === b[i]?.weight && face.unicodeRange === b[i]?.unicodeRange);
}

/**
 * Keeps a copy of Discord's typeface for the popup. Runs on Discord, where the files were already
 * downloaded for the page, and only fetches again when Discord ships different files.
 *
 * @param doc - Discord's document.
 * @returns Resolves once the copy is current, or left as it was when the files could not be read.
 */
export async function captureDiscordFont(doc: Document = document): Promise<void> {
  const faces = findFontFaces(doc.styleSheets, doc.baseURI);
  const stored = await discordFont.getValue();

  if (!faces.length || (stored && sameFaces(stored.faces, faces))) {
    return;
  }

  const [error, files] = await tryCatch(Promise.all(faces.map(async (face) => {
    const response = await fetch(face.url);

    if (!response.ok) {
      // Stryker disable next-line StringLiteral: the reason is never shown; a failed fetch only leaves the copy as it was.
      throw new Error(`${face.url}: ${response.status}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  })));

  if (error || files.reduce((sum, file) => sum + file.length, 0) > MAX_BYTES) {
    return;
  }

  await discordFont.setValue({ faces: faces.map((face, i) => ({ ...face, data: toBase64(files[i]!) })) });
}

/**
 * Makes the copy of Discord's typeface available to an extension page, such as the popup.
 * Until it loads, or when there is none, the page shows the bundled Noto Sans.
 *
 * @param fonts - The page's font set.
 * @returns Resolves once the faces are added; a face that cannot be read is skipped.
 */
export async function loadDiscordFont(fonts: FontFaceSet = document.fonts): Promise<void> {
  const stored = await discordFont.getValue();

  await Promise.all((stored?.faces ?? []).map(async ({ data, weight, unicodeRange }) => {
    const face = new FontFace(DISCORD_FONT, fromBase64(data), { weight, ...(unicodeRange && { unicodeRange }) });
    const [error] = await tryCatch(face.load());

    if (!error) {
      fonts.add(face);
    }
  }));
}
