// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { accentCss, themeStyles } from "./custom";
import { followStoredTheme } from "./follow";
import { COLOR_THEMES, THEME_CLASS } from "./gradients";
import { themeSnapshot } from "./storage";
import { FALLBACK_PALETTES } from "./tokens";
import { readTheme, watchTheme } from "./watch";



const wait = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

type TQuery = { matches: boolean; listeners: Set<() => void> };

/**
 * A matchMedia whose answers the test sets, and whose changes it can announce.
 *
 * @param answers - Which queries match.
 * @returns A way to change an answer, announcing it.
 */
function stubMedia(answers: Record<string, boolean> = {}): { set: (query: string, matches: boolean) => void } {
  const queries = new Map<string, TQuery>();
  const get = (query: string): TQuery => {
    if (!queries.has(query)) {
      queries.set(query, { matches: answers[query] ?? false, listeners: new Set() });
    }

    return queries.get(query)!;
  };

  vi.stubGlobal("matchMedia", (query: string) => {
    const entry = get(query);

    return {
      get matches() {
        return entry.matches;
      },
      addEventListener: (type: string, listener: () => void) => type === "change" && entry.listeners.add(listener),
      removeEventListener: (type: string, listener: () => void) => type === "change" && entry.listeners.delete(listener),
    };
  });

  return {
    set(query, matches) {
      const entry = get(query);

      entry.matches = matches;
      entry.listeners.forEach(listener => listener());
    },
  };
}

function resetPage(): void {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-nf-scheme");
  document.documentElement.removeAttribute("data-nf-reduced-motion");
  document.head.innerHTML = "";
}

beforeEach(() => {
  fakeBrowser.reset();
  resetPage();
  stubMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readTheme", () => {
  it("reads the theme, scheme and palette Discord shows, the fallback filling what it does not set", () => {
    const root = document.documentElement;

    root.className = "theme-midnight";
    root.style.setProperty("--background-base-lower", "rgb(1, 2, 3)");

    const snapshot = readTheme(root)!;

    expect(snapshot).toMatchObject({ theme: "midnight", scheme: "dark", reducedMotion: false });
    expect(snapshot.palette.bg).toBe("rgb(1, 2, 3)");
    expect(snapshot.palette.text).toBe(FALLBACK_PALETTES.dark.text);
  });

  it("is none for a page with no Discord theme", () => {
    expect(readTheme(document.documentElement)).toBeNull();
  });

  it("sees reduced motion from Discord's setting or the system's", () => {
    const root = document.documentElement;

    root.className = "theme-light reduce-motion";
    expect(readTheme(root)).toMatchObject({ scheme: "light", reducedMotion: true });

    root.className = "theme-light";
    expect(readTheme(root)!.reducedMotion).toBe(false);

    stubMedia({ "(prefers-reduced-motion: reduce)": true });
    expect(readTheme(root)!.reducedMotion).toBe(true);
  });
});

describe("watchTheme", () => {
  it("tells the theme now, and again only when it changes, however it changes", async () => {
    const root = document.documentElement;
    const heard = vi.fn();

    root.className = "theme-dark";

    const stop = watchTheme(root, heard);

    expect(heard).toHaveBeenCalledTimes(1);

    // The same again changes nothing.
    root.className = "theme-dark";
    await wait();
    expect(heard).toHaveBeenCalledTimes(1);

    root.className = "theme-light";
    await wait();
    expect(heard).toHaveBeenCalledTimes(2);
    expect(heard.mock.lastCall![0]).toMatchObject({ theme: "light" });

    // A client theme adds a style, a stylesheet loads, or the system's motion setting changes.
    const style = document.createElement("style");

    style.textContent = ".theme-light { --background-base-lower: rgb(9, 9, 9); }";
    root.style.setProperty("--background-base-lower", "rgb(9, 9, 9)");
    document.head.append(style);
    await wait();
    expect(heard).toHaveBeenCalledTimes(3);

    root.style.setProperty("--background-base-lower", "rgb(8, 8, 8)");
    style.dispatchEvent(new Event("load"));
    await wait();
    expect(heard).toHaveBeenCalledTimes(4);

    root.style.setProperty("--background-base-lower", "rgb(7, 7, 7)");
    const image = document.createElement("img");

    document.head.append(image);
    image.dispatchEvent(new Event("load"));
    await wait();
    expect(heard).toHaveBeenCalledTimes(5);

    stop();
    root.className = "theme-dark";
    await wait();
    expect(heard).toHaveBeenCalledTimes(5);
  });

  it("waits for a page that has a theme, and hears the system's motion setting", async () => {
    const media = stubMedia();
    const root = document.documentElement;
    const heard = vi.fn();
    const stop = watchTheme(root, heard);

    expect(heard).not.toHaveBeenCalled();
    root.className = "theme-dark";
    await wait();
    expect(heard).toHaveBeenCalledTimes(1);

    media.set("(prefers-reduced-motion: reduce)", true);
    await wait();
    expect(heard).toHaveBeenCalledTimes(2);
    expect(heard.mock.lastCall![0]).toMatchObject({ reducedMotion: true });

    stop();
  });
});

describe("watchTheme, one change at a time", () => {
  let background = "rgb(1, 1, 1)";
  let heard: ReturnType<typeof vi.fn>;
  let stop: () => void;
  let media: ReturnType<typeof stubMedia>;

  // Each change to the page is told apart by the palette it brings, read from a style the test controls.
  async function changesAfter(change: () => unknown): Promise<number> {
    const before = heard.mock.calls.length;

    background = `rgb(${Math.floor(Math.random() * 255)}, 2, 3)`;
    await change();
    await wait();

    return heard.mock.calls.length - before;
  }

  beforeEach(() => {
    media = stubMedia();
    document.documentElement.className = "theme-dark";
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ getPropertyValue: (name: string) => (name === "--background-base-lower" ? background : "") } as CSSStyleDeclaration);
    heard = vi.fn();
    stop = watchTheme(document.documentElement, heard);
  });

  afterEach(() => {
    stop();
  });

  it("hears the root's class and style change, and none of its other attributes", async () => {
    expect(await changesAfter(() => document.documentElement.classList.add("x"))).toBe(1);
    expect(await changesAfter(() => document.documentElement.setAttribute("style", "color: red"))).toBe(1);
    expect(await changesAfter(() => document.documentElement.setAttribute("data-x", "1"))).toBe(0);
  });

  it("hears a style added or edited in the head, however deep", async () => {
    const holder = document.head.appendChild(document.createElement("div"));
    const style = document.head.appendChild(document.createElement("style"));

    style.textContent = "a {}";
    await wait();
    expect(await changesAfter(() => document.head.append(document.createElement("meta")))).toBe(1);
    expect(await changesAfter(() => holder.append(document.createElement("span")))).toBe(1);
    expect(await changesAfter(() => ((style.firstChild as Text).data = "b {}"))).toBe(1);
  });

  it("hears a stylesheet or style finish loading, and not other things", async () => {
    const link = document.head.appendChild(document.createElement("link"));
    const style = document.head.appendChild(document.createElement("style"));
    const image = document.head.appendChild(document.createElement("img"));

    await wait();
    expect(await changesAfter(() => link.dispatchEvent(new Event("load")))).toBe(1);
    expect(await changesAfter(() => style.dispatchEvent(new Event("load")))).toBe(1);
    expect(await changesAfter(() => image.dispatchEvent(new Event("load")))).toBe(0);
  });

  it("hears the system's motion setting change", async () => {
    expect(await changesAfter(() => media.set("(prefers-reduced-motion: reduce)", true))).toBe(1);
  });

  it("hears nothing once stopped, not even a change already on its way", async () => {
    const link = document.head.appendChild(document.createElement("link"));

    await wait();
    expect(await changesAfter(() => {
      document.documentElement.classList.add("pending");
      stop();
    })).toBe(0);

    // Heard, and waiting the moment it gives other changes to come, when it is stopped.
    stop = watchTheme(document.documentElement, heard);
    expect(await changesAfter(async () => {
      document.documentElement.classList.add("again");
      await new Promise(resolve => setTimeout(resolve, 0));
      stop();
    })).toBe(0);
    expect(await changesAfter(() => link.dispatchEvent(new Event("load")))).toBe(0);
    expect(await changesAfter(() => media.set("(prefers-reduced-motion: reduce)", true))).toBe(0);
  });
});

describe("followStoredTheme", () => {
  it("follows the system's scheme until a Discord tab has shared a palette", async () => {
    const media = stubMedia();
    const root = document.documentElement;
    const stop = followStoredTheme(root);

    expect(root.dataset.nfScheme).toBe("dark");
    expect(root.style.getPropertyValue("--nf-bg")).toBe(FALLBACK_PALETTES.dark.bg);
    expect(root.dataset.nfReducedMotion).toBe("false");

    media.set("(prefers-color-scheme: light)", true);
    expect(root.dataset.nfScheme).toBe("light");
    expect(root.style.getPropertyValue("--nf-bg")).toBe(FALLBACK_PALETTES.light.bg);

    media.set("(prefers-reduced-motion: reduce)", true);
    expect(root.dataset.nfReducedMotion).toBe("true");

    stop();
    media.set("(prefers-color-scheme: light)", false);
    expect(root.dataset.nfScheme).toBe("light");
  });

  it("takes the palette Discord shared, now and as it changes, and its reduced motion too", async () => {
    const root = document.documentElement;
    const palette = { ...FALLBACK_PALETTES.dark, bg: "rgb(5, 5, 5)" };

    await themeSnapshot.setValue({ theme: "darker", scheme: "dark", palette, reducedMotion: true });

    const stop = followStoredTheme(root);

    await wait();
    expect(root.style.getPropertyValue("--nf-bg")).toBe("rgb(5, 5, 5)");
    expect(root.dataset.nfReducedMotion).toBe("true");
    expect(root.style.colorScheme).toBe("dark");

    await themeSnapshot.setValue({ theme: "light", scheme: "light", palette: FALLBACK_PALETTES.light, reducedMotion: false });
    await wait();
    expect(root.dataset.nfScheme).toBe("light");
    expect(root.dataset.nfReducedMotion).toBe("false");

    stop();
  });
});

describe("themeStyles", () => {
  const ocean = COLOR_THEMES.find(theme => theme.id === "ocean")!;
  const snippet = (id: string, css: string, enabled = true) => ({ id, name: id, css, enabled });
  const styles = () => [...document.head.querySelectorAll("style[data-nitfree-theme]")].map(style => style.getAttribute("data-nitfree-theme"));

  it("adds the color theme, then the accent, then each snippet that is on, after Discord's own styles", () => {
    document.head.append(document.createElement("style"));

    const theme = themeStyles(document);

    theme.render({ colorTheme: ocean, accent: "#e91e63", snippets: [snippet("a", "a{}"), snippet("b", "b{}", false), snippet("c", "c{}")] });

    expect(styles()).toEqual(["colors", "accent", "snippet-a", "snippet-c"]);
    expect(document.head.lastElementChild?.getAttribute("data-nitfree-theme")).toBe("snippet-c");
    expect(document.head.querySelector("[data-nitfree-theme=\"accent\"]")?.textContent).toBe(accentCss("#e91e63"));
    expect(document.documentElement.classList.contains(THEME_CLASS)).toBe(true);
    theme.stop();
  });

  it("reuses a style, and removes what is no longer wanted, taking the class off with the color theme", () => {
    const theme = themeStyles(document);

    theme.render({ colorTheme: ocean, accent: "#e91e63", snippets: [snippet("a", "a{}")] });

    const kept = document.head.querySelector("[data-nitfree-theme=\"snippet-a\"]");

    theme.render({ colorTheme: null, accent: null, snippets: [snippet("a", "a{}"), snippet("b", "b{}")] });
    expect(styles()).toEqual(["snippet-a", "snippet-b"]);
    expect(document.head.querySelector("[data-nitfree-theme=\"snippet-a\"]")).toBe(kept);
    expect(document.documentElement.classList.contains(THEME_CLASS)).toBe(false);

    theme.render({ colorTheme: null, accent: "not a color", snippets: [snippet("a", "a{ color: red }")] });
    expect(styles()).toEqual(["snippet-a"]);
    expect(kept?.textContent).toBe("a{ color: red }");
    theme.stop();
  });

  it("keeps its styles after the ones Discord adds as it loads more", async () => {
    const theme = themeStyles(document);

    theme.render({ colorTheme: null, accent: "#e91e63", snippets: [snippet("a", "a{}")] });
    document.head.append(document.createElement("style"));
    await wait();

    expect(styles()).toEqual(["accent", "snippet-a"]);
    expect(document.head.lastElementChild?.getAttribute("data-nitfree-theme")).toBe("snippet-a");

    // Nothing to move when it is last already, so its own move is not answered again.
    const before = [...document.head.children];

    await wait();
    expect([...document.head.children]).toEqual(before);
    theme.stop();
  });

  it("puts the class back as soon as Discord sets its root's classes anew, but never takes a Nitro theme's away", async () => {
    const root = document.documentElement;
    const theme = themeStyles(document);

    theme.render({ colorTheme: ocean, accent: null, snippets: [] });
    root.className = "theme-light";
    await wait();
    expect(root.classList.contains(THEME_CLASS)).toBe(true);

    theme.stop();
    expect(root.classList.contains(THEME_CLASS)).toBe(false);
    expect(styles()).toEqual([]);

    // A Nitro theme was there first: the class is Discord's, and stays.
    root.className = `theme-dark ${THEME_CLASS}`;

    const again = themeStyles(document);

    again.render({ colorTheme: ocean, accent: null, snippets: [] });
    again.stop();
    expect(root.classList.contains(THEME_CLASS)).toBe(true);
  });
});
