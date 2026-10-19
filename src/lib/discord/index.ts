export {
  chatButtonGroupOf,
  composerOf,
  draftAttachmentIds,
  findAll,
  findChatButtonGroups,
  findEmojiButton,
  findExpandedPickerButton,
  findMessageBox,
  findPickerButtons,
  findUploadInput,
  readChatButtonClasses,
  readPickerTabClasses,
  type TChatButtonClasses,
  type TPickerTabClasses,
} from "./composer";
export { CLASS_PATTERNS, SELECTORS } from "./selectors";

/**
 * Pages the content script runs on and the background worker talks to.
 */
export const DISCORD_MATCHES = ["*://discord.com/*"];
