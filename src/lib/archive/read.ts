import type { TArchiveSettings, TArchiveTag } from "./schema";

import type { TItemType } from "~/lib/db";

import { strFromU8, unzipSync } from "fflate";
import * as v from "valibot";

import { hashBytes } from "~/lib/db/library";
import { inspectImage } from "~/lib/media";

import { ARCHIVE_VERSION, ArchiveSettingsSchema, LibrarySchema, ManifestSchema } from "./schema";



export type TArchiveErrorCode = "corrupt" | "unsupported" | "invalid" | "empty";

/**
 * Why a file could not be imported, in words that can be shown as they are.
 */
export class ArchiveError extends Error {
  readonly code: TArchiveErrorCode;

  /**
   * Creates the error.
   *
   * @param code - What kind of problem it is, for code that reacts to it.
   * @param message - What to tell the user.
   */
  constructor(code: TArchiveErrorCode, message: string) {
    super(message);
    this.name = "ArchiveError";
    this.code = code;
  }
}

/**
 * An item read from an archive, ready to be imported. Tags are named rather than identified,
 * since ids only mean something inside the library that was exported.
 */
export type TImportEntry = {
  /**
   * The id the item had when exported, or null for a plain image.
   */
  id: string | null;
  type: TItemType;
  title: string;
  description: string;
  tags: string[];
  favorite: boolean;
  createdAt: number | null;
  updatedAt: number | null;
  usedAt: number | null;
  usageCount: number;
  hash: string;
  bytes: Uint8Array<ArrayBuffer>;
};

export type TParsedArchive = {

  /**
   * A `.nitfree` archive, or a plain zip of images.
   */
  kind: "nitfree" | "images";
  entries: TImportEntry[];
  tags: TArchiveTag[];
  settings: TArchiveSettings | null;

  /**
   * Files in a plain zip that are not images Nitfree accepts.
   */
  ignored: number;
  totalSize: number;
};

function describe(error: v.ValiError<v.GenericSchema>): string {
  const [issue] = error.issues;
  const path = issue ? v.getDotPath(issue) : null;

  return path ? `${path}: ${issue?.message}` : (issue?.message ?? "unknown problem");
}

function parseJson<T extends v.GenericSchema>(schema: T, bytes: Uint8Array, name: string): v.InferOutput<T> {
  let data: unknown;

  try {
    data = JSON.parse(strFromU8(bytes));
  }
  catch {
    throw new ArchiveError("corrupt", `${name} is not readable`);
  }

  const result = v.safeParse(schema, data);

  if (!result.success) {
    throw new ArchiveError("invalid", `${name} is not valid (${describe(new v.ValiError(result.issues))})`);
  }

  return result.output;
}

function toOwned(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

async function readNitfree(files: Record<string, Uint8Array>): Promise<TParsedArchive> {
  const manifest = parseJson(ManifestSchema, files["manifest.json"]!, "manifest.json");

  if (manifest.version > ARCHIVE_VERSION) {
    throw new ArchiveError("unsupported", `This archive was made by a newer version of Nitfree (format ${manifest.version})`);
  }

  const library = files["library.json"] ? parseJson(LibrarySchema, files["library.json"], "library.json") : null;

  if (!library) {
    throw new ArchiveError("corrupt", "library.json is missing");
  }

  const settings = files["settings.json"] ? parseJson(ArchiveSettingsSchema, files["settings.json"], "settings.json") : null;
  const tagNames = new Map(library.tags.map(tag => [tag.id, tag.name]));
  const ids = new Set<string>();
  const entries: TImportEntry[] = [];
  let totalSize = 0;

  for (const item of library.items) {
    if (ids.has(item.id)) {
      throw new ArchiveError("invalid", `library.json lists "${item.title}" twice`);
    }

    ids.add(item.id);

    const bytes = files[item.file];

    if (!bytes) {
      throw new ArchiveError("corrupt", `The file of "${item.title}" is missing from the archive`);
    }

    if (bytes.length !== item.size || await hashBytes(toOwned(bytes)) !== item.hash) {
      throw new ArchiveError("corrupt", `The file of "${item.title}" does not match what was exported`);
    }

    const names = item.tags.map((id) => {
      const name = tagNames.get(id);

      if (name === undefined) {
        throw new ArchiveError("invalid", `"${item.title}" has a tag that the archive does not list`);
      }

      return name;
    });

    totalSize += bytes.length;
    entries.push({
      id: item.id,
      type: item.type,
      title: item.title.trim(),
      description: item.description,
      tags: names,
      favorite: item.favorite,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      usedAt: item.usedAt,
      usageCount: item.usageCount,
      hash: item.hash,
      bytes: toOwned(bytes),
    });
  }

  return { kind: "nitfree", entries, tags: library.tags, settings, ignored: 0, totalSize };
}

function titleOf(file: string): string {
  return file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

async function readImages(files: Record<string, Uint8Array>): Promise<TParsedArchive> {
  const entries: TImportEntry[] = [];
  const tags = new Map<string, TArchiveTag>();
  let ignored = 0;
  let totalSize = 0;

  for (const [path, bytes] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const parts = path.split("/").filter(Boolean);
    const file = parts.pop() ?? "";

    // Folders, and the clutter that operating systems leave in zips.
    if (!file || path.endsWith("/") || parts.includes("__MACOSX") || file.startsWith(".") || !bytes.length) {
      continue;
    }

    if (!inspectImage(bytes)) {
      ignored++;
      continue;
    }

    const names = parts.map(part => part.trim()).filter(Boolean);

    for (const name of names) {
      const key = name.toLocaleLowerCase();

      if (!tags.has(key)) {
        tags.set(key, { id: key, name, color: null, createdAt: 0 });
      }
    }

    totalSize += bytes.length;
    entries.push({
      id: null,
      type: "image",
      title: titleOf(file) || file,
      description: "",
      tags: names,
      favorite: false,
      createdAt: null,
      updatedAt: null,
      usedAt: null,
      usageCount: 0,
      hash: await hashBytes(toOwned(bytes)),
      bytes: toOwned(bytes),
    });
  }

  if (!entries.length) {
    throw new ArchiveError("empty", "This file has no images Nitfree accepts (PNG, APNG, GIF, WebP and JPEG)");
  }

  return { kind: "images", entries, tags: [...tags.values()], settings: null, ignored, totalSize };
}

/**
 * Reads and checks a `.nitfree` archive, or a plain zip of images, without touching the library.
 * Everything is validated up front, so a bad file fails here and never half-imports.
 * Folder names of a plain zip become tags, and file names become titles.
 *
 * @param bytes - The file's bytes.
 * @returns What the file holds.
 * @throws {ArchiveError} When the file is not a zip, is damaged, or is not something Nitfree understands.
 */
export async function readArchive(bytes: Uint8Array): Promise<TParsedArchive> {
  let files: Record<string, Uint8Array>;

  try {
    files = unzipSync(bytes);
  }
  catch {
    throw new ArchiveError("corrupt", "This is not a zip file, or it is damaged");
  }

  return files["manifest.json"] ? readNitfree(files) : readImages(files);
}
