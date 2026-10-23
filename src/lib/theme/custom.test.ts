import { describe, expect, it } from "vitest";

import { BLURPLE_BASE, BLURPLE_SCALE } from "./blurple";
import { accentCss, accentScale, hexToHsl, mergeSnippets } from "./custom";



describe("hexToHsl", () => {
  it("reads a color's hue, saturation and lightness", () => {
    expect(hexToHsl("#ff0000")).toEqual([0, 100, 50]);
    expect(hexToHsl("#00FF00")).toEqual([120, 100, 50]);
    expect(hexToHsl("#808080")).toEqual([0, 0, 50.196]);
    expect(hexToHsl("#5865f2")).toEqual([234.935, 85.556, 64.706]);
  });

  it("refuses anything but #rrggbb", () => {
    expect(hexToHsl("red")).toBeNull();
    expect(hexToHsl("#f00")).toBeNull();
    expect(hexToHsl("#12345g")).toBeNull();
  });
});

describe("accentScale", () => {
  it("gives Discord's own scale back for Discord's blurple", () => {
    const scale = accentScale("#5865f2")!;

    scale.forEach(([, s, l], index) => {
      expect(s).toBeCloseTo(BLURPLE_SCALE[index]![1], 1);
      expect(l).toBeCloseTo(BLURPLE_SCALE[index]![2], 1);
    });
  });

  it("makes the main step the color, and keeps the steps from light to dark", () => {
    const scale = accentScale("#e91e63")!;
    const lightness = scale.map(([, , l]) => l);

    expect(scale).toHaveLength(BLURPLE_SCALE.length);
    expect(scale[BLURPLE_BASE - 1]).toEqual(hexToHsl("#e91e63"));
    expect(new Set(scale.map(([h]) => h))).toEqual(new Set([hexToHsl("#e91e63")![0]]));
    expect(lightness).toEqual(lightness.toSorted((a, b) => b - a));
    expect(lightness.at(-1)).toBe(0);
  });

  it("keeps a gray accent gray", () => {
    expect(accentScale("#777777")!.every(([, s]) => s === 0)).toBe(true);
  });
});

describe("accentCss", () => {
  it("redefines every step of the scale, above Discord's own :root, keeping its saturation setting", () => {
    const css = accentCss("#ff0000");

    expect(css.startsWith(":root:root {")).toBe(true);
    expect(css).toContain("--blurple-50-hsl: 0 calc(var(--saturation-factor, 1) * 100%) 50%;");
    expect(css.match(/--blurple-\d+-hsl/g)).toHaveLength(BLURPLE_SCALE.length);
  });

  it("is empty for an invalid color", () => {
    expect(accentCss("blue")).toBe("");
  });
});

describe("mergeSnippets", () => {
  const snippet = (id: string, css: string, enabled = true) => ({ id, name: id, css, enabled });

  it("adds a backup's snippets after the ones kept, updating those it shares", () => {
    const kept = [snippet("a", "a {}"), snippet("b", "b {}")];
    const imported = [snippet("b", "b { color: red }", false), snippet("c", "c {}")];

    expect(mergeSnippets(kept, imported)).toEqual([snippet("a", "a {}"), snippet("b", "b { color: red }", false), snippet("c", "c {}")]);
  });
});
