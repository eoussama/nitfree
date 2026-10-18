export { findAll, findChatButtonGroups, readChatButtonClasses, type TChatButtonClasses } from "./composer";
export { SELECTORS } from "./selectors";

/**
 * Pages the content script runs on and the background worker talks to.
 */
export const DISCORD_MATCHES = ["*://discord.com/*"];
