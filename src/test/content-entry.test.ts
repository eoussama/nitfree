// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { accentColor, colorTheme, cssSnippets } from "~/lib/settings";
import { captureDiscordFont, themeSnapshot } from "~/lib/theme";
import { startContent } from "~/lib/ui/content";

import content from "../entrypoints/discord.content";



const stopped = vi.hoisted((): string[] => []);

vi.mock("~/lib/ui/content", () => ({ startContent: vi.fn(() => () => void stopped.push("content")) }));
vi.mock("~/lib/theme", async original => ({ ...await original<object>(), captureDiscordFont: vi.fn(async () => undefined) }));

const settle = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The content script's context, as WXT gives it: timers, and what to run once Nitfree is disabled.
 *
 * @returns The context, and a way to invalidate it.
 */
function context() {
  const cleanups: (() => void)[] = [];
  const ctx = {
    isInvalid: false,
    setTimeout: (callback: () => void) => {
      callback();

      return 0;
    },
    onInvalidated: (cleanup: () => void) => void cleanups.push(cleanup),
  };

  return { ctx, invalidate: () => cleanups.forEach(cleanup => cleanup()) };
}

beforeEach(() => {
  fakeBrowser.reset();
  stopped.length = 0;
  document.head.innerHTML = "";
  document.documentElement.className = "theme-dark";
  vi.mocked(captureDiscordFont).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  document.documentElement.className = "";
});

describe("the Discord content script", () => {
  it("runs on Discord, marks the page, starts Nitfree, and keeps Discord's theme for the popup", async () => {
    const { ctx, invalidate } = context();

    expect(content.matches).toEqual(["*://discord.com/*"]);
    content.main(ctx as never);

    expect(document.documentElement.dataset.nitfree).toMatch(/^\d+\.\d+\.\d+$/);
    expect(startContent).toHaveBeenCalledWith(ctx);
    expect(captureDiscordFont).toHaveBeenCalledOnce();
    await settle();
    expect((await themeSnapshot.getValue())?.theme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--nf-bg")).not.toBe("");

    invalidate();
    expect(stopped).toEqual(["content"]);
  });

  it("gives Discord the theme set in the popup, following its changes, and takes it away when stopped", async () => {
    await accentColor.setValue("#e91e63");
    await colorTheme.setValue("ocean");

    const { ctx, invalidate } = context();

    content.main(ctx as never);
    await settle();

    const styles = () => [...document.head.querySelectorAll("style[data-nitfree-theme]")].map(style => style.getAttribute("data-nitfree-theme"));

    expect(styles()).toEqual(["colors", "accent"]);
    expect(document.documentElement.classList.contains("custom-theme-background")).toBe(true);

    await cssSnippets.setValue([{ id: "a", name: "a", css: "a{}", enabled: true }]);
    await accentColor.setValue(null);
    await colorTheme.setValue(null);
    await settle();
    expect(styles()).toEqual(["snippet-a"]);

    // Taken out of storage altogether, the snippets go too.
    await cssSnippets.removeValue();
    await settle();
    expect(styles()).toEqual([]);

    await colorTheme.setValue("nebula");
    await settle();
    expect(styles()).toEqual(["colors"]);

    invalidate();
    expect(styles()).toEqual([]);
    expect(document.documentElement.classList.contains("custom-theme-background")).toBe(false);
  });

  it("draws nothing once stopped before the settings were read, and goes on when the typeface cannot be kept", async () => {
    await accentColor.setValue("#e91e63");
    vi.mocked(captureDiscordFont).mockRejectedValue(new Error("Offline."));

    const { ctx, invalidate } = context();

    content.main(ctx as never);
    invalidate();
    await settle();
    expect(document.head.querySelector("style[data-nitfree-theme]")).toBeNull();
  });
});
