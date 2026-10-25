/**
 * What the health check looks at, in the order it shows them, by the part of Discord they are in.
 * Most are named after the entry of `SELECTORS` they test, so a report points straight at the line
 * to fix.
 */
export const CHECK_GROUPS = {
  extension: ["background", "library", "content"],
  composer: [
    "composer",
    "composerBox",
    "messageBox",
    "uploadInput",
    "chatButtonGroup",
    "chatButtonModel",
    "chatButtonLook",
    "pickerButton",
    "emojiButton",
    "toggler",
  ],
  theme: ["theme"],
  chat: ["chatEmoji", "chatSticker", "chatImage"],
  picker: ["pickerTabList", "pickerTabLook", "pickerTab"],
  menu: ["contextMenu", "menuLook", "saveMenuItem"],
} as const;

export type TCheckGroup = keyof typeof CHECK_GROUPS;
export type TCheckId = (typeof CHECK_GROUPS)[TCheckGroup][number];

/**
 * How a check went:
 * - ok: found as Nitfree expects it;
 * - fallback: found only by a later alternative, so it still works, but Discord changed something;
 * - missing: not found, so what relies on it is broken;
 * - skipped: not checked, as what it needs is not on the page, such as a channel to write in.
 */
export type TCheckStatus = "ok" | "fallback" | "missing" | "skipped";

export type TCheck = {
  id: TCheckId;
  status: TCheckStatus;

  /**
   * For a fallback, which alternative matched, counted from 1, out of how many.
   */
  alternative?: { used: number; of: number };
};

/**
 * Where the checks ran: in a Discord tab, in none because none is open, or in one Nitfree does not
 * run in, such as a tab opened before Nitfree was installed or updated.
 */
export type TDiagnosticsTab = "found" | "none" | "unreachable";

export type TDiagnostics = {
  tab: TDiagnosticsTab;
  checks: TCheck[];
};
