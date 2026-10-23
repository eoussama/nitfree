import fs from "node:fs";
import path from "node:path";

import { generateChromeMessages, parseMessagesText } from "@wxt-dev/i18n/build";
import { vi } from "vitest";

import { fakeBrowser } from "wxt/testing/fake-browser";



/**
 * The English messages, as the browser would have them from the extension's `_locales`.
 */
const messages = generateChromeMessages(parseMessagesText(fs.readFileSync(path.resolve(import.meta.dirname, "../locales/en.yml"), "utf8"), "YAML")) as Record<string, { message: string }>;

/**
 * Makes `i18n.t` answer as the browser does in English, so tests read the text users see.
 */
export function stubMessages(): void {
  vi.spyOn(fakeBrowser.i18n, "getMessage").mockImplementation(((key: string, substitutions?: string[]) => {
    const text = messages[key]?.message ?? "";

    return text.replace(/\$(\d)/g, (_, at: string) => substitutions?.[Number(at) - 1] ?? "");
  }) as never);
}
