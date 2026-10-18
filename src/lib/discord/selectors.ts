/**
 * Every place Nitfree reads Discord's markup, so a Discord update is a one-file fix.
 * Discord's class names end in a build hash (`buttons__74017`), so selectors match on the stable prefix.
 * Each entry lists alternatives, most specific first; the first one that matches anything wins.
 */
export const SELECTORS = {
  /**
   * The composer's right-hand button group (gift, GIF, sticker, emoji, apps).
   */
  chatButtonGroup: [
    "[class*=\"channelTextArea_\"] [class^=\"buttons_\"]",
    "[class^=\"buttons_\"]:has(> .expression-picker-chat-input-button)",
  ],

  /**
   * The composer box around the text field and its buttons; panels open above it, aligned to its right edge.
   */
  composerBox: [
    "[class*=\"channelTextArea_\"]",
  ],

  /**
   * One of Discord's own buttons in that group, used as the model for Nitfree's button.
   * The GIF button comes first and carries no extra state classes.
   */
  chatButtonModel: [
    ".expression-picker-chat-input-button",
    "[class^=\"buttonContainer_\"]",
  ],
} as const satisfies Record<string, readonly string[]>;
