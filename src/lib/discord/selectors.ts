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
    "form:has([role=\"textbox\"])",
  ],

  /**
   * One of Discord's own buttons in that group, used as the model for Nitfree's button.
   * The GIF button comes first and carries no extra state classes.
   */
  chatButtonModel: [
    ".expression-picker-chat-input-button",
    "[class^=\"buttonContainer_\"]",
  ],

  /**
   * The chat bar buttons that open Discord's expression picker on one of its tabs (GIF, sticker, emoji).
   * Discord marks the one whose tab is showing with aria-expanded="true". The emoji button is the last.
   */
  pickerButton: [
    ".expression-picker-chat-input-button [role=\"button\"]",
    "[class^=\"buttonContainer_\"] > [role=\"button\"][aria-controls]",
  ],

  /**
   * The emoji button in a composer's button group. When this stops matching, the last picker button is used.
   */
  emojiButton: [
    "[class*=\"emojiButton_\"][role=\"button\"]",
  ],

  /**
   * Discord's expression picker tab bar (GIFs, Stickers, Emoji). The picker is rendered in a layer
   * outside the composer, so this is searched for in the whole page.
   */
  pickerTabList: [
    "[class*=\"expressionPickerPositionLayer\"] [role=\"tablist\"]",
    "[role=\"tablist\"]:has(> #emoji-picker-tab)",
  ],

  /**
   * A whole composer: its text box, hidden upload input, attachment tray and buttons.
   */
  composer: [
    "form:has([role=\"textbox\"])",
    "[class*=\"channelTextArea_\"]",
  ],

  /**
   * The composer's hidden file input. Files put on it and announced with a change event join the
   * message's attachments, exactly as when picked from the upload button.
   */
  uploadInput: [
    "[class*=\"uploadInput_\"] input[type=\"file\"]",
    "input.file-input[type=\"file\"]",
  ],

  /**
   * The composer's text box. Enter in it sends the message, with its attachments.
   */
  messageBox: [
    "[role=\"textbox\"][data-slate-editor=\"true\"]",
    "[role=\"textbox\"][contenteditable=\"true\"]",
  ],

  /**
   * The attachments waiting in the composer, one per file, in Discord's "attachments" list.
   */
  draftAttachment: [
    "[data-list-id=\"attachments\"] [data-list-item-id]",
    "[data-list-item-id^=\"attachments___\"]",
  ],
} as const satisfies Record<string, readonly string[]>;

/**
 * Discord class names, matched on their prefix, that Nitfree copies so its own elements look native.
 */
export const CLASS_PATTERNS = {
  /** A chat bar button's container, its button and the button's inner wrapper. */
  chatButtonContainer: /^buttonContainer_/,
  chatButton: /^button_/,
  chatButtonWrapper: /^buttonWrapper_/,

  /** A tab in the expression picker, and the class Discord adds to the selected one. */
  pickerTab: /^nav(?:Button|Item)_/,
  pickerTabActive: /^navButtonActive_/,
} as const;

/**
 * Discord classes that drive behavior rather than looks; copying them would make Discord treat
 * Nitfree's elements as its own.
 */
export const BEHAVIOR_CLASSES: ReadonlySet<string> = new Set(["expression-picker-chat-input-button"]);
