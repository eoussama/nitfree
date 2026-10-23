import { vi } from "vitest";

import { fakeBrowser } from "wxt/testing/fake-browser";



/**
 * Makes `i18n.t` answer with the key and what it was given, such as `editor_save` (the browser's
 * name for `editor.save`) or `editor_duplicate["Wave"]`, so tests can tell which message was asked for and with what.
 */
export function stubMessages(): void {
  vi.spyOn(fakeBrowser.i18n, "getMessage").mockImplementation(((key: string, substitutions?: unknown) => {
    return substitutions === undefined ? key : `${key}${JSON.stringify(substitutions)}`;
  }) as never);
}
