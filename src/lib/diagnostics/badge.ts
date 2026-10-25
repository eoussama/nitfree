/**
 * Discord's red, for the toolbar badge.
 */
const BADGE_COLOR = "#da373c";

/**
 * Shows on Nitfree's toolbar button, for one Discord tab, whether Nitfree finds what it needs there:
 * a red "!" while something is missing, nothing otherwise.
 *
 * @param tabId - The tab, if the message came from one.
 * @param problems - How many checks failed.
 * @returns Resolves once the badge is set.
 */
export async function showProblems(tabId: number | undefined, problems: number): Promise<void> {
  if (tabId === undefined) {
    return;
  }

  if (problems) {
    await browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
  }

  await browser.action.setBadgeText({ tabId, text: problems ? "!" : "" });
}
