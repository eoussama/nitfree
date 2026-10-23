import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { migrateLegacyDatabase } from "~/lib/db";
import { broadcast, sendMessage } from "~/lib/messaging";

import background from "../entrypoints/background";



vi.mock("~/lib/db", async original => ({ ...await original<object>(), migrateLegacyDatabase: vi.fn(async () => null) }));
vi.mock("~/lib/messaging", async original => ({ ...await original<object>(), broadcast: vi.fn(async () => undefined) }));

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(broadcast).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the background", () => {
  it("answers requests from the extension's pages and Discord's tabs", async () => {
    background.main();

    expect(await sendMessage("runtime:ping")).toEqual({ version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
    expect(await sendMessage("library:list")).toEqual([]);
  });

  it("notes when Nitfree was installed, and not when it was updated", async () => {
    background.main();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: "update", previousVersion: "0.1.0" });
    expect(await fakeBrowser.storage.local.get("installedOn")).toEqual({});

    await fakeBrowser.runtime.onInstalled.trigger({ reason: "install" });
    expect((await fakeBrowser.storage.local.get("installedOn")).installedOn).toEqual(expect.any(Number));
  });

  it("announces the tags and items it moved from the previous version, and only those", async () => {
    vi.mocked(migrateLegacyDatabase).mockResolvedValueOnce({ items: ["i"], tags: ["t"], skipped: 0 });
    background.main();
    await settle();
    expect(vi.mocked(broadcast).mock.calls).toEqual([
      ["tags:changed", { change: "added", ids: ["t"] }],
      ["library:changed", { change: "added", ids: ["i"] }],
    ]);

    vi.mocked(broadcast).mockClear();
    vi.mocked(migrateLegacyDatabase).mockResolvedValueOnce({ items: [], tags: [], skipped: 2 });
    background.main();
    await settle();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("says when moving the previous version's library failed, to retry on the next start", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(migrateLegacyDatabase).mockRejectedValueOnce(new Error("Locked."));
    background.main();
    await settle();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("retried on the next start"), expect.any(Error));
  });
});
