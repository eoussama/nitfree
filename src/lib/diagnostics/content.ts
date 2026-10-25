import { handleTabMessages, sendMessage } from "~/lib/messaging";

import { checkComposer, runChecks } from "./checks";



/**
 * How long after the page changes the message box is checked again. Discord renders a channel in
 * steps, and Nitfree's button joins it on the next frame.
 */
const HEALTH_DELAY = 3000;

/**
 * Counts what Nitfree cannot find in the message box shown. A page without one, such as the friends
 * list, counts nothing, so the toolbar only warns when a message box is there and Nitfree cannot use it.
 *
 * @returns How many checks of the message box failed.
 */
export function composerProblems(): number {
  return checkComposer().filter(check => check.id !== "composer" && check.status === "missing").length;
}

/**
 * Answers the popup's diagnostics, and tells the background whenever the message box shown stops or
 * starts working, so the toolbar button can show it.
 *
 * @returns A function that stops both.
 */
export function startDiagnostics(): () => void {
  let reported: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = (): void => {
    timer = undefined;

    const problems = composerProblems();

    if (problems !== reported) {
      reported = problems;
      void sendMessage("diagnostics:status", { problems }).catch(() => undefined);
    }
  };

  const observer = new MutationObserver(() => {
    timer ??= setTimeout(check, HEALTH_DELAY);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  timer = setTimeout(check, HEALTH_DELAY);

  const stopAnswering = handleTabMessages({ "diagnostics:run": ({ interactive }) => runChecks(interactive) });

  return () => {
    observer.disconnect();
    clearTimeout(timer);
    stopAnswering();
  };
}
