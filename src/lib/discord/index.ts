export { copyEmojiRow, discordOptions, emojiRows, NITFREE_OPTION, type TCopiedRow } from "./autocomplete";
export {
  chatButtonGroupOf,
  composerOf,
  draftAttachmentIds,
  findAll,
  findChatButtonGroups,
  findDiscordAutocomplete,
  findEmojiButton,
  findExpandedPickerButton,
  findMessageBox,
  findPickerButtons,
  findUploadInput,
  messageBoxOf,
  readChatButtonClasses,
  readPickerTabClasses,
  type TChatButtonClasses,
  type TPickerTabClasses,
} from "./composer";
export { emojiMedia, findChatMedia, imageMedia, stickerMedia, type TChatMedia } from "./media";
export { readMenuLook, type TMenuLook } from "./menu";
export { CLASS_PATTERNS, SELECTORS } from "./selectors";

/**
 * Pages the content script runs on and the background worker talks to.
 */
export const DISCORD_MATCHES = ["*://discord.com/*"];
