// @vitest-environment happy-dom
import type { TItem } from "~/lib/db";

import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { autocomplete, clickAction, playAnimations, shortcut, shortcutKeys, suggestionsAt } from "~/lib/settings";
import { DEFAULT_SHORTCUT } from "~/lib/shortcut";

import { closeMenu, menu, openMenu } from "./menu.svelte";
import { followPreferences, preferences } from "./preferences.svelte";
import { neighborTile } from "./tiles";



const wait = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));
const item = { id: "a", title: "wave" } as TItem;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.innerHTML = "";
  closeMenu();
});

describe("the item menu", () => {
  it("opens for an item where it is told, and closes giving focus back only when asked", () => {
    const button = document.createElement("button");

    document.body.append(button);
    openMenu(item, 10, 20, button);
    expect(menu).toMatchObject({ item, x: 10, y: 20, restoreFocus: button });

    closeMenu();
    expect(menu).toMatchObject({ item: null, restoreFocus: null });
    expect(document.activeElement).not.toBe(button);

    openMenu(item, 1, 2, button);
    closeMenu(true);
    expect(document.activeElement).toBe(button);

    openMenu(item, 1, 2);
    expect(() => closeMenu(true)).not.toThrow();
  });
});

describe("preferences", () => {
  it("read the saved settings, and follow the popup's changes until stopped", async () => {
    await clickAction.setValue("add");
    await playAnimations.setValue(false);
    await autocomplete.setValue(false);
    await suggestionsAt.setValue("start");
    await shortcut.setValue(false);
    await shortcutKeys.setValue({ key: "K", ctrl: true, alt: false, shift: false, meta: false });

    const stop = followPreferences();

    await wait();
    expect(preferences).toMatchObject({ clickAction: "add", playAnimations: false, autocomplete: false, suggestionsAt: "start", shortcut: null });

    await clickAction.setValue("send");
    await playAnimations.setValue(true);
    await autocomplete.setValue(true);
    await suggestionsAt.setValue("end");
    await wait();
    expect(preferences).toMatchObject({ clickAction: "send", playAnimations: true, autocomplete: true, suggestionsAt: "end" });

    await shortcut.setValue(true);
    await wait();
    expect(preferences.shortcut).toEqual({ key: "K", ctrl: true, alt: false, shift: false, meta: false });

    await shortcutKeys.setValue(DEFAULT_SHORTCUT);
    await wait();
    expect(preferences.shortcut).toEqual(DEFAULT_SHORTCUT);

    stop();
    await clickAction.setValue("add");
    await wait();
    expect(preferences.clickAction).toBe("send");
  });

  it("do not take what was read once they have been stopped", async () => {
    await clickAction.setValue("add");
    followPreferences()();
    preferences.clickAction = "send";
    await wait();
    expect(preferences.clickAction).toBe("send");
  });
});

describe("neighborTile of an element that is no tile", () => {
  it("finds nothing where the page has no tiles", () => {
    document.body.innerHTML = "<div id=\"x\"></div>";
    expect(neighborTile(document.querySelector<HTMLElement>("#x")!)).toBeNull();
  });
});
