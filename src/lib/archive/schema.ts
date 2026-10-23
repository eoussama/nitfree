import * as v from "valibot";

import { ITEM_TYPES } from "~/lib/db/types";
import { ACCENT_PATTERN, SNIPPET_CSS_MAX, SNIPPET_NAME_MAX } from "~/lib/theme/custom";



/**
 * The archive format version. Bump it when a change would make older readers misread an archive.
 */
export const ARCHIVE_VERSION = 1;

export const ARCHIVE_EXTENSION = ".nitfree";

const Count = v.pipe(v.number(), v.integer(), v.minValue(0));
const Timestamp = v.pipe(v.number(), v.integer(), v.minValue(0));

export const ManifestSchema = v.object({
  format: v.literal("nitfree"),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  appVersion: v.string(),
  exportedAt: Timestamp,
});

export const ArchiveTagSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  color: v.nullable(v.string()),
  createdAt: Timestamp,
});

export const ArchivePackSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  // The id of the item in the archive that shows the pack, or null for its newest.
  icon: v.optional(v.nullable(v.string()), null),
  createdAt: Timestamp,
});

export const ArchiveItemSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  type: v.picklist(ITEM_TYPES),
  title: v.pipe(v.string(), v.trim(), v.minLength(1)),
  description: v.string(),
  tags: v.array(v.string()),
  // Added in 0.4.0; archives made before it hold no packs.
  packs: v.optional(v.array(v.string()), []),
  favorite: v.boolean(),
  hash: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
  size: Count,
  format: v.picklist(["png", "gif", "webp", "jpeg"]),
  mime: v.string(),
  width: Count,
  height: Count,
  animated: v.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  usedAt: v.nullable(Timestamp),
  usageCount: Count,
  file: v.pipe(v.string(), v.regex(/^files\/[^/\\]+$/)),
});

export const LibrarySchema = v.object({
  items: v.array(ArchiveItemSchema),
  tags: v.array(ArchiveTagSchema),
  packs: v.optional(v.array(ArchivePackSchema), []),
});

export const ArchiveSettingsSchema = v.object({
  sendSizes: v.object({ emoji: v.number(), sticker: v.number() }),
  clickAction: v.picklist(["send", "add"]),
  playAnimations: v.boolean(),
  // Added in 0.3.0; backups made before it leave the setting as it is.
  autocomplete: v.optional(v.boolean()),
  suggestionsAt: v.optional(v.picklist(["end", "start"])),
  shortcut: v.optional(v.boolean()),
  shortcutKeys: v.optional(v.object({ key: v.pipe(v.string(), v.minLength(1), v.maxLength(32)), ctrl: v.boolean(), alt: v.boolean(), shift: v.boolean(), meta: v.boolean() })),
  // Added in 0.4.0.
  accentColor: v.optional(v.nullable(v.pipe(v.string(), v.regex(ACCENT_PATTERN)))),
  snippets: v.optional(v.array(v.object({
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
    name: v.pipe(v.string(), v.maxLength(SNIPPET_NAME_MAX)),
    css: v.pipe(v.string(), v.maxLength(SNIPPET_CSS_MAX)),
    enabled: v.boolean(),
  }))),
});

export type TManifest = v.InferOutput<typeof ManifestSchema>;
export type TArchiveTag = v.InferOutput<typeof ArchiveTagSchema>;
export type TArchivePack = v.InferOutput<typeof ArchivePackSchema>;
export type TArchiveItem = v.InferOutput<typeof ArchiveItemSchema>;
export type TArchiveLibrary = v.InferOutput<typeof LibrarySchema>;
export type TArchiveSettings = v.InferOutput<typeof ArchiveSettingsSchema>;
