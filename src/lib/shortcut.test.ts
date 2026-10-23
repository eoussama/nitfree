import { describe, expect, it } from "vitest";

import { DEFAULT_SHORTCUT, formatShortcut, isUsableShortcut, keyOf, matchesShortcut, shortcutKeys, shortcutOf } from "./shortcut";



function press(key: string, code: string, modifiers: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) {
  return {
    key,
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  };
}

describe("keyOf", () => {
  it("names letters as the layout prints them, in capitals", () => {
    expect(keyOf(press("n", "KeyN"))).toBe("N");
    // An AZERTY keyboard's A sits where QWERTY has its Q.
    expect(keyOf(press("a", "KeyQ"))).toBe("A");
    expect(keyOf(press("N", "KeyN"))).toBe("N");
  });

  it("names a key by its place when a modifier changes what it types", () => {
    // Option+N on a Mac starts an accent, and Option+A types å.
    expect(keyOf(press("Dead", "KeyN"))).toBe("N");
    expect(keyOf(press("å", "KeyA"))).toBe("A");
    // Shift+1 types ! on a QWERTY keyboard; the number row of an AZERTY one types & without Shift.
    expect(keyOf(press("!", "Digit1"))).toBe("1");
    expect(keyOf(press("&", "Digit1"))).toBe("1");
  });

  it("names other keys, and nothing for a modifier on its own", () => {
    expect(keyOf(press(" ", "Space"))).toBe("Space");
    expect(keyOf(press("F2", "F2"))).toBe("F2");
    expect(keyOf(press(".", "Period"))).toBe(".");

    for (const key of ["Control", "Alt", "Shift", "Meta", "AltGraph"]) {
      expect(keyOf(press(key, `${key}Left`))).toBeNull();
    }
  });
});

describe("shortcuts", () => {
  it("reads a combination from a key press, and matches it with exactly its modifiers", () => {
    const shortcut = shortcutOf(press("k", "KeyK", { ctrlKey: true, shiftKey: true }))!;

    expect(shortcut).toEqual({ key: "K", ctrl: true, alt: false, shift: true, meta: false });
    expect(matchesShortcut(press("K", "KeyK", { ctrlKey: true, shiftKey: true }), shortcut)).toBe(true);
    expect(matchesShortcut(press("k", "KeyK", { ctrlKey: true }), shortcut)).toBe(false);
    expect(matchesShortcut(press("k", "KeyK", { ctrlKey: true, shiftKey: true, altKey: true }), shortcut)).toBe(false);
    expect(shortcutOf(press("Control", "ControlLeft", { ctrlKey: true }))).toBeNull();
  });

  it("opens the panel with Ctrl+Alt+N by default, also on a Mac", () => {
    expect(matchesShortcut(press("n", "KeyN", { ctrlKey: true, altKey: true }), DEFAULT_SHORTCUT)).toBe(true);
    expect(matchesShortcut(press("Dead", "KeyN", { ctrlKey: true, altKey: true }), DEFAULT_SHORTCUT)).toBe(true);
    expect(matchesShortcut(press("n", "KeyN", { altKey: true }), DEFAULT_SHORTCUT)).toBe(false);
  });

  it("needs Ctrl, Alt or Command, so typing is never taken", () => {
    expect(isUsableShortcut(DEFAULT_SHORTCUT)).toBe(true);
    expect(isUsableShortcut({ key: "N", ctrl: false, alt: false, shift: true, meta: false })).toBe(false);
    expect(isUsableShortcut({ key: "N", ctrl: false, alt: false, shift: false, meta: true })).toBe(true);
  });

  it("is shown as each system shows it", () => {
    const shortcut = { key: "E", ctrl: true, alt: true, shift: true, meta: true };

    expect(shortcutKeys(shortcut, false)).toEqual(["Ctrl", "Alt", "Shift", "Win", "E"]);
    expect(formatShortcut(DEFAULT_SHORTCUT, false)).toBe("Ctrl+Alt+N");
    expect(shortcutKeys(shortcut, true)).toEqual(["⌃", "⌥", "⇧", "⌘", "E"]);
    expect(formatShortcut(DEFAULT_SHORTCUT, true)).toBe("⌃⌥N");
  });
});
