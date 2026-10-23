// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArchiveError } from "~/lib/archive";
import { stubMessages } from "~/test/i18n";

import { download } from "./download";
import { escapeTop, hasEscapeLayer, onEscape } from "./escape";
import { isolate } from "./isolate";
import { motion } from "./motion.svelte";
import { clearNotice, notice, NOTICE_DELAY, showNotice } from "./notice.svelte";
import { archiveProblem } from "./problems";
import { focusAfterRemoval, neighborTile, tileAfterUnfavorite } from "./tiles";



beforeEach(() => {
  document.body.innerHTML = "";
  stubMessages();
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
  it("says what is wrong with a backup in words, and any other error as it is", () => {
    const reasons = ["notZip", "unreadable", "invalid", "newer", "noLibrary", "duplicate", "missingFile", "mismatch", "unknownTag", "unknownPack", "empty", "notInLibrary"] as const;

    for (const reason of reasons) {
      expect(archiveProblem(new ArchiveError(reason, "log message", { name: "n", problem: "p", title: "t" }))).toContain(`archive_${reason}`);
      expect(archiveProblem(new ArchiveError(reason, "log message"))).toContain(`archive_${reason}`);
    }

    expect(archiveProblem(new Error("plain"))).toBe("plain");
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
