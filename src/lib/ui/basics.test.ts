// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArchiveError } from "~/lib/archive";

import { download } from "./download";
import { escapeTop, hasEscapeLayer, onEscape } from "./escape";
import { isolate } from "./isolate";
import { motion } from "./motion.svelte";
import { clearNotice, notice, NOTICE_DELAY, showNotice } from "./notice.svelte";
import { archiveProblem } from "./problems";
import { focusAfterRemoval, neighborTile, tileAfterUnfavorite } from "./tiles";



beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("escape layers", () => {
  it("close the most recent popup first, one Escape at a time, and forget one that closed itself", () => {
    const calls: string[] = [];
    const stopA = onEscape(() => calls.push("a"));
    const stopB = onEscape(() => calls.push("b"));

    expect(hasEscapeLayer()).toBe(true);
    expect(escapeTop()).toBe(true);
    stopB();
    stopB();
    expect(escapeTop()).toBe(true);
    stopA();
    expect(hasEscapeLayer()).toBe(false);
    expect(escapeTop()).toBe(false);
    expect(calls).toEqual(["b", "a"]);
  });
});

describe("download", () => {
  it("clicks a hidden link to the file, then takes the address back a while later", () => {
    vi.useFakeTimers();

    const clicked: { download: string; href: string }[] = [];
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href });
    });

    download(new Blob(["x"]), "backup.nitfree");

    expect(create).toHaveBeenCalledOnce();
    expect(clicked).toEqual([{ download: "backup.nitfree", href: "blob:file" }]);
    expect(document.querySelector("a")).toBeNull();
    expect(revoke).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith("blob:file");
  });
});

describe("isolate", () => {
  function setup(options?: Parameters<typeof isolate>[1]) {
    const host = document.createElement("div");
    const heard: string[] = [];

    document.body.append(host);
    for (const type of ["keydown", "paste", "click", "focusin"]) {
      document.body.addEventListener(type, () => heard.push(type));
    }

    return { host, heard, stop: isolate(host, options) };
  }

  it("keeps keys and pastes in the host, letting Escape through", () => {
    const { host, heard, stop } = setup();

    host.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    host.dispatchEvent(new Event("paste", { bubbles: true }));
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    host.dispatchEvent(new Event("click", { bubbles: true }));
    expect(heard).toEqual(["keydown", "click"]);

    stop();
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(heard).toEqual(["keydown", "click", "keydown"]);
  });

  it("also keeps presses in, and hides focus moving in and out, when asked", () => {
    const { host, heard, stop } = setup({ pointer: true, focus: true });
    const outside = document.createElement("div");

    document.body.append(outside);
    host.dispatchEvent(new Event("click", { bubbles: true }));
    host.dispatchEvent(new Event("focusin", { bubbles: true }));
    outside.dispatchEvent(new Event("focusin", { bubbles: true }));
    expect(heard).toEqual(["focusin"]);

    stop();
    host.dispatchEvent(new Event("focusin", { bubbles: true }));
    expect(heard).toEqual(["focusin", "focusin"]);
  });
});

describe("the notice", () => {
  it("shows the latest text for a while, then goes", () => {
    expect(notice.text).toBeNull();
    vi.useFakeTimers();
    showNotice("one");
    showNotice("two");
    expect(notice.text).toBe("two");

    vi.advanceTimersByTime(NOTICE_DELAY - 1);
    expect(notice.text).toBe("two");
    vi.advanceTimersByTime(1);
    expect(notice.text).toBeNull();

    showNotice("three");
    clearNotice();
    expect(notice.text).toBeNull();
  });

  it("gives a new notice the whole delay, whatever the last one had left", () => {
    vi.useFakeTimers();
    showNotice("one");
    vi.advanceTimersByTime(NOTICE_DELAY - 100);
    showNotice("two");
    vi.advanceTimersByTime(200);
    expect(notice.text).toBe("two");
    vi.advanceTimersByTime(NOTICE_DELAY);
    expect(notice.text).toBeNull();
  });
});

describe("motion", () => {
  it("follows the reduced motion flag the theme engine puts on the page", async () => {
    expect(motion.reduced).toBe(false);

    document.documentElement.dataset.nfReducedMotion = "true";
    await new Promise(resolve => setTimeout(resolve));
    expect(motion.reduced).toBe(true);

    document.documentElement.dataset.nfReducedMotion = "false";
    await new Promise(resolve => setTimeout(resolve));
    expect(motion.reduced).toBe(false);
  });
});

describe("archiveProblem", () => {
  const params = { name: "library.json", problem: "tags: Invalid type", title: "wave" };

  it.each([
    ["notZip", "This is not a zip file, or it is damaged."],
    ["unreadable", "library.json in this file cannot be read."],
    ["invalid", "library.json in this file is not valid (tags: Invalid type)."],
    ["newer", "This backup was made by a newer version of Nitfree. Update Nitfree to import it."],
    ["noLibrary", "This file is not a complete Nitfree backup."],
    ["duplicate", "This backup lists “wave” twice."],
    ["missingFile", "The file of “wave” is missing from this backup."],
    ["mismatch", "The file of “wave” was changed or damaged after it was exported."],
    ["unknownTag", "“wave” has a tag this backup does not list."],
    ["unknownPack", "“wave” is in a pack this backup does not list."],
    ["empty", "This has no images Nitfree accepts (PNG, APNG, GIF, WebP and JPEG)."],
    ["notInLibrary", "The file of “wave” is missing from your library."],
  ] as const)("says what %s means, naming what it is about", (reason, message) => {
    expect(archiveProblem(new ArchiveError(reason, "log message", params))).toBe(message);
  });

  it.each([
    ["unreadable", " in this file cannot be read."],
    ["invalid", " in this file is not valid ()."],
    ["duplicate", "This backup lists “” twice."],
    ["missingFile", "The file of “” is missing from this backup."],
    ["mismatch", "The file of “” was changed or damaged after it was exported."],
    ["unknownTag", "“” has a tag this backup does not list."],
    ["unknownPack", "“” is in a pack this backup does not list."],
    ["notInLibrary", "The file of “” is missing from your library."],
  ] as const)("names nothing for %s when the error names nothing", (reason, message) => {
    expect(archiveProblem(new ArchiveError(reason, "log message"))).toBe(message);
  });

  it("says any other error as it is", () => {
    expect(archiveProblem(new Error("plain"))).toBe("plain");
    expect(archiveProblem("text")).toBe("text");
  });
});

describe("tiles", () => {
  const grid = () => `<section><h2 data-section="favorites"></h2><button data-tile="a"></button><button data-tile="b"></button></section>
    <section><button data-tile="a"></button><button data-tile="b"></button><button data-tile="c"></button></section><input type="search">`;
  const tiles = () => [...document.querySelectorAll<HTMLElement>("[data-tile]")];

  it("go to the next tile of another item, else the previous one, else none", () => {
    document.body.innerHTML = grid();

    expect(neighborTile(tiles()[0]!)?.dataset.tile).toBe("b");
    expect(neighborTile(tiles()[4]!)?.dataset.tile).toBe("b");
    expect(neighborTile(tiles()[2]!)?.dataset.tile).toBe("b");

    document.body.innerHTML = "<button data-tile=\"a\"></button>";
    expect(neighborTile(tiles()[0]!)).toBeNull();
  });

  it("moves focus to the neighbor, or the search box when there is none", () => {
    document.body.innerHTML = grid();
    focusAfterRemoval(tiles()[4]!);
    expect(document.activeElement).toBe(tiles()[3]);

    document.body.innerHTML = "<button data-tile=\"a\"></button><input type=\"search\">";
    focusAfterRemoval(tiles()[0]!);
    expect(document.activeElement?.getAttribute("type")).toBe("search");

    document.body.innerHTML = "<button data-tile=\"a\"></button>";
    expect(() => focusAfterRemoval(tiles()[0]!)).not.toThrow();
  });

  it("sends an unfavorited tile's focus to its place in the last section, and leaves other tiles where they are", () => {
    document.body.innerHTML = grid();

    expect(tileAfterUnfavorite(tiles()[0]!)).toBe(tiles()[2]);
    expect(tileAfterUnfavorite(tiles()[3]!)).toBe(tiles()[3]);

    document.body.innerHTML = "<section><h2 data-section=\"favorites\"></h2><button data-tile=\"a\"></button></section>";
    expect(tileAfterUnfavorite(tiles()[0]!)).toBe(tiles()[0]);
  });
});
