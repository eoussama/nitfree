// @vitest-environment happy-dom
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadDiscordFont } from "~/lib/theme";
import { mountOverlay } from "~/lib/ui/inject";



vi.mock("../entrypoints/popup/App.svelte", () => import("./Stub.svelte"));
vi.mock("~/lib/ui/inject", () => ({ mountOverlay: vi.fn() }));
vi.mock("~/lib/theme", async original => ({ ...await original<object>(), loadDiscordFont: vi.fn(async () => undefined) }));

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
  vi.mocked(mountOverlay).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the popup", () => {
  it("shows the app in its root, with the add dialog over it and Discord's typeface when it has one", async () => {
    document.body.innerHTML = "<div id=\"app\"></div>";
    vi.mocked(loadDiscordFont).mockRejectedValueOnce(new Error("None kept."));
    await import("../entrypoints/popup/main");
    flushSync();

    expect(document.querySelector("#app [data-stub]")).not.toBeNull();
    expect(mountOverlay).toHaveBeenCalledOnce();
    expect(loadDiscordFont).toHaveBeenCalledOnce();
  });

  it("refuses to start without its root", async () => {
    await expect(import("../entrypoints/popup/main")).rejects.toThrow("Popup root element is missing");
  });
});
