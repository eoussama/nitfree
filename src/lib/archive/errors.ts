export type TArchiveErrorCode = "corrupt" | "unsupported" | "invalid" | "empty";

/**
 * What exactly went wrong, which the interface turns into a message in the user's language.
 */
export type TArchiveErrorReason
  = | "notZip"
    | "unreadable"
    | "invalid"
    | "newer"
    | "noLibrary"
    | "duplicate"
    | "missingFile"
    | "mismatch"
    | "unknownTag"
    | "empty"
    | "notInLibrary";

const CODES: Record<TArchiveErrorReason, TArchiveErrorCode> = {
  notZip: "corrupt",
  unreadable: "corrupt",
  invalid: "invalid",
  newer: "unsupported",
  noLibrary: "corrupt",
  duplicate: "invalid",
  missingFile: "corrupt",
  mismatch: "corrupt",
  unknownTag: "invalid",
  empty: "empty",
  notInLibrary: "corrupt",
};

/**
 * Why an archive could not be read or written. The message is in English, for logs; the reason
 * and its params let the interface say it in the user's language.
 */
export class ArchiveError extends Error {
  readonly code: TArchiveErrorCode;
  readonly reason: TArchiveErrorReason;
  readonly params: Record<string, string>;

  /**
   * Creates the error.
   *
   * @param reason - What exactly went wrong.
   * @param message - The problem in English.
   * @param params - What the message names, such as an item's title.
   */
  constructor(reason: TArchiveErrorReason, message: string, params: Record<string, string> = {}) {
    super(message);
    this.name = "ArchiveError";
    this.code = CODES[reason];
    this.reason = reason;
    this.params = params;
  }
}
