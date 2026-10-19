/**
 * How long a notice stays up.
 */
export const NOTICE_DELAY = 5000;

type TNoticeState = {
  text: string | null;
};

/**
 * A short message at the bottom of the window, such as why an item could not be sent.
 */
export const notice: TNoticeState = $state({ text: null });

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Shows a notice, replacing the one showing.
 *
 * @param text - What to say.
 */
export function showNotice(text: string): void {
  clearTimeout(timer);
  notice.text = text;
  timer = setTimeout(clearNotice, NOTICE_DELAY);
}

/**
 * Hides the notice.
 */
export function clearNotice(): void {
  clearTimeout(timer);
  notice.text = null;
}
