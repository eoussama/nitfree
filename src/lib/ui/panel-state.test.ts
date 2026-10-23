// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closePanel, notePress, noteRelease, openPanel, panel, setToggleHandler, togglePanel, togglePopover, wasOpenFor } from "./panel.svelte";
import { hideTooltip, showTooltip, tooltip, tooltipState } from "./tooltip.svelte";



const button = () => document.body.appendChild(document.createElement("button"));

beforeEach(() => {
  document.body.innerHTML = "";
  closePanel();
  setToggleHandler(togglePopover);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the panel", () => {
  it("opens where it is told, for a button, and closes", () => {
    const anchor = button();

    openPanel("picker", anchor);
    expect(panel).toMatchObject({ open: true, mode: "picker", anchor });
    closePanel();
    expect(panel).toMatchObject({ open: false, mode: null, anchor: null });
  });

  it("opens as a popover from a button's click, and closes at the next click of the same button", () => {
    const anchor = button();

    togglePanel(anchor);
    expect(panel).toMatchObject({ open: true, mode: "popover", anchor });
    togglePanel(anchor);
    expect(panel.open).toBe(false);

    // Another button takes it over rather than closing it.
    togglePanel(anchor);
    togglePanel(button());
    expect(panel.open).toBe(true);
  });

  it("goes by what a recent press found, since Discord closes its picker before the click arrives", () => {
    const anchor = button();
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);

    openPanel("picker", anchor);
    notePress(anchor);
    // Discord closed its picker on the press.
    closePanel();
    expect(wasOpenFor(anchor)).toBe(true);

    // A press is used once.
    expect(wasOpenFor(anchor)).toBe(false);

    notePress(anchor);
    now.mockReturnValue(1000 + 1499);
    expect(wasOpenFor(anchor)).toBe(false);

    openPanel("picker", anchor);
    notePress(anchor);
    now.mockReturnValue(1000 + 5000);
    closePanel();
    // Too long ago to count: the panel as it is now decides.
    expect(wasOpenFor(anchor)).toBe(false);
  });

  it("keeps a long press alive until it is released, and ignores the release of another button", () => {
    const anchor = button();
    const now = vi.spyOn(performance, "now").mockReturnValue(0);

    openPanel("popover", anchor);
    notePress(anchor);
    now.mockReturnValue(4000);
    noteRelease(button());
    noteRelease(anchor);
    closePanel();
    expect(wasOpenFor(anchor)).toBe(true);

    // With no press at all, there is nothing to release.
    noteRelease(anchor);
  });

  it("hands clicks to the handler the content script sets", () => {
    const handler = vi.fn();
    const anchor = button();

    setToggleHandler(handler);
    togglePanel(anchor);
    expect(handler).toHaveBeenCalledWith(anchor);
    expect(panel.open).toBe(false);
  });
});

describe("the tooltip", () => {
  it("shows next to an element with its keys, and hides for anyone or only for its owner", () => {
    const first = button();
    const second = button();

    showTooltip(first, "Send", "top", ["Ctrl", "K"]);
    expect(tooltipState).toMatchObject({ text: "Send", side: "top", keys: ["Ctrl", "K"] });

    hideTooltip(second);
    expect(tooltipState.text).toBe("Send");
    hideTooltip(first);
    expect(tooltipState).toMatchObject({ text: null, rect: null });

    showTooltip(first, "Again", "left");
    expect(tooltipState.keys).toEqual([]);
    hideTooltip();
    expect(tooltipState.text).toBeNull();
  });

  it("is shown by hovering or keyboard focus, and hidden by leaving, pressing or blurring", () => {
    const node = button();
    const cleanup = tooltip("Edit", "bottom", ["E"])(node) as () => void;

    node.dispatchEvent(new Event("pointerenter"));
    expect(tooltipState).toMatchObject({ text: "Edit", side: "bottom", keys: ["E"] });
    node.dispatchEvent(new Event("pointerleave"));
    expect(tooltipState.text).toBeNull();

    node.dispatchEvent(new Event("pointerenter"));
    node.dispatchEvent(new Event("pointerdown"));
    expect(tooltipState.text).toBeNull();

    // Clicking focuses a button without showing; the keyboard does.
    vi.spyOn(node, "matches").mockReturnValue(false);
    node.dispatchEvent(new Event("focus"));
    expect(tooltipState.text).toBeNull();
    vi.spyOn(node, "matches").mockReturnValue(true);
    node.dispatchEvent(new Event("focus"));
    expect(tooltipState.text).toBe("Edit");
    node.dispatchEvent(new Event("blur"));
    expect(tooltipState.text).toBeNull();

    cleanup();
    node.dispatchEvent(new Event("pointerenter"));
    expect(tooltipState.text).toBeNull();
  });

  it("follows a new text while it shows, and is hidden when the element goes for good", async () => {
    const node = button();

    tooltip("Favorite")(node);
    node.dispatchEvent(new Event("pointerenter"));

    const cleanup = tooltip("Unfavorite")(node) as () => void;

    expect(tooltipState.text).toBe("Unfavorite");

    // Torn down to update its text, the element stays, and so does the tooltip.
    cleanup();
    await Promise.resolve();
    expect(tooltipState.text).toBe("Unfavorite");

    // Torn down with the element, the tooltip goes.
    const gone = tooltip("Unfavorite")(node) as () => void;

    node.remove();
    gone();
    await Promise.resolve();
    expect(tooltipState.text).toBeNull();
  });
});
