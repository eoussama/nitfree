import type { MockInstance } from "vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { sendMessage, sendTabMessage } from "~/lib/messaging";

import { findDiscordTab, runDiagnostics } from "./run";



vi.mock("~/lib/messaging", async original => ({
  ...await original<object>(),
  sendMessage: vi.fn(async () => undefined),
  sendTabMessage: vi.fn(async () => [{ id: "theme", status: "ok" }]),
}));

let query: MockInstance<(info: Browser.tabs.QueryInfo) => Promise<Partial<Browser.tabs.Tab>[]>>;

/**
 * Makes the browser list these tabs: the one shown in this window, and every Discord tab.
 *
 * @param shown - The Discord tab shown, if any.
 * @param open - Every Discord tab.
 */
function tabs(shown: Partial<Browser.tabs.Tab>[], open: Partial<Browser.tabs.Tab>[]): void {
  query.mockImplementation(async info => (info.active ? shown : open));
}

beforeEach(() => {
  fakeBrowser.reset();
  // tabs.query is overloaded; the spy needs its promise form.
  query = vi.spyOn(browser.tabs, "query") as unknown as typeof query;
  tabs([], []);
  vi.mocked(sendMessage).mockReset().mockResolvedValue(undefined);
  vi.mocked(sendTabMessage).mockReset().mockResolvedValue([{ id: "theme", status: "ok" }]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("findDiscordTab", () => {
  it("prefers the Discord tab shown in this window, else the first one open", async () => {
    tabs([{ id: 2 }], [{ id: 1 }, { id: 2 }]);
    expect(await findDiscordTab()).toBe(2);
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true, url: ["*://discord.com/*"] });

    tabs([], [{ id: 1 }, { id: 2 }]);
    expect(await findDiscordTab()).toBe(1);
    expect(query).toHaveBeenLastCalledWith({ url: ["*://discord.com/*"] });

    tabs([], []);
    expect(await findDiscordTab()).toBeNull();

    tabs([], [{}]);
    expect(await findDiscordTab()).toBeNull();
  });
});

describe("runDiagnostics", () => {
  it("checks the background and library, then the page in the Discord tab", async () => {
    tabs([{ id: 7 }], [{ id: 7 }]);

    expect(await runDiagnostics(true)).toEqual({
      tab: "found",
      checks: [
        { id: "background", status: "ok" },
        { id: "library", status: "ok" },
        { id: "content", status: "ok" },
        { id: "theme", status: "ok" },
      ],
    });
    expect(sendMessage).toHaveBeenCalledWith("runtime:ping");
    expect(sendMessage).toHaveBeenCalledWith("tags:list");
    expect(sendTabMessage).toHaveBeenCalledWith(7, "diagnostics:run", { interactive: true });
  });

  it("says when the background or the library does not answer", async () => {
    vi.mocked(sendMessage).mockImplementation((async (name: string) => {
      throw new Error(`${name} failed`);
    }) as never);
    tabs([{ id: 7 }], [{ id: 7 }]);

    const { checks } = await runDiagnostics(false);

    expect(checks.slice(0, 2)).toEqual([{ id: "background", status: "missing" }, { id: "library", status: "missing" }]);
    expect(sendTabMessage).toHaveBeenCalledWith(7, "diagnostics:run", { interactive: false });

    vi.mocked(sendMessage).mockImplementation((async (name: string) => {
      if (name === "tags:list") {
        throw new Error("Locked.");
      }
    }) as never);
    expect((await runDiagnostics(false)).checks.slice(0, 2)).toEqual([{ id: "background", status: "ok" }, { id: "library", status: "missing" }]);
  });

  it("skips the page without a Discord tab", async () => {
    expect(await runDiagnostics(false)).toEqual({
      tab: "none",
      checks: [
        { id: "background", status: "ok" },
        { id: "library", status: "ok" },
        { id: "content", status: "skipped" },
      ],
    });
    expect(sendTabMessage).not.toHaveBeenCalled();
  });

  it("says when Nitfree does not run in the Discord tab", async () => {
    tabs([], [{ id: 3 }]);
    vi.mocked(sendTabMessage).mockRejectedValue(new Error("Receiving end does not exist."));

    expect(await runDiagnostics(false)).toEqual({
      tab: "unreachable",
      checks: [
        { id: "background", status: "ok" },
        { id: "library", status: "ok" },
        { id: "content", status: "missing" },
      ],
    });
  });
});
