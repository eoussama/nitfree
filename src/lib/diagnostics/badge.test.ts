import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { showProblems } from "./badge";



beforeEach(() => {
  fakeBrowser.reset();
});

describe("showProblems", () => {
  it("puts a red \"!\" on the toolbar button for the tab with problems, and takes it off once they are gone", async () => {
    await showProblems(4, 2);

    expect(await browser.action.getBadgeText({ tabId: 4 })).toBe("!");
    expect(await browser.action.getBadgeBackgroundColor({ tabId: 4 })).toEqual([218, 55, 60, 255]);
    expect(await browser.action.getBadgeText({ tabId: 5 })).toBe("");

    await showProblems(4, 0);
    expect(await browser.action.getBadgeText({ tabId: 4 })).toBe("");
  });

  it("leaves the badge's color alone when there is nothing to show", async () => {
    await showProblems(4, 0);

    expect(await browser.action.getBadgeBackgroundColor({ tabId: 4 })).toEqual(await browser.action.getBadgeBackgroundColor({}));
  });

  it("does nothing for a message that came from no tab", async () => {
    await showProblems(undefined, 3);

    expect(await browser.action.getBadgeText({})).toBe("");
  });
});
