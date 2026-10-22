import type { TArchiveErrorReason } from "~/lib/archive";

import { toError } from "@eoussama/core";

import { ArchiveError } from "~/lib/archive";



type TParams = Record<string, string>;

// One entry per reason, so each message is checked against the names it fills in.
const MESSAGES: Record<TArchiveErrorReason, (params: TParams) => string> = {
  notZip: () => i18n.t("archive.notZip"),
  unreadable: ({ name = "" }) => i18n.t("archive.unreadable", { name }),
  invalid: ({ name = "", problem = "" }) => i18n.t("archive.invalid", { name, problem }),
  newer: () => i18n.t("archive.newer"),
  noLibrary: () => i18n.t("archive.noLibrary"),
  duplicate: ({ title = "" }) => i18n.t("archive.duplicate", { title }),
  missingFile: ({ title = "" }) => i18n.t("archive.missingFile", { title }),
  mismatch: ({ title = "" }) => i18n.t("archive.mismatch", { title }),
  unknownTag: ({ title = "" }) => i18n.t("archive.unknownTag", { title }),
  empty: () => i18n.t("archive.empty"),
  notInLibrary: ({ title = "" }) => i18n.t("archive.notInLibrary", { title }),
};

/**
 * Says what went wrong with a backup, in the user's language when the problem is a known one.
 *
 * @param error - What was thrown.
 * @returns The message to show.
 */
export function archiveProblem(error: unknown): string {
  return error instanceof ArchiveError ? MESSAGES[error.reason](error.params) : toError(error).message;
}
