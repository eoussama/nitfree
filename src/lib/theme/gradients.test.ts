import { describe, expect, it } from "vitest";

import { hexToRgb, hslToRgb, rgbToHsl } from "./color";
import { blendColors, COLOR_THEMES, colorThemeCss, findColorTheme, THEME_CLASS } from "./gradients";



const rgb = (hex: string) => hexToRgb(hex)!;

describe("colors", () => {
  it("go to HSL and back", () => {
    for (const hex of ["#5865f2", "#ff0000", "#0f4c45", "#fdf6c3", "#808080"]) {
      expect(hslToRgb(rgbToHsl(rgb(hex)))).toEqual(rgb(hex));
    }
  });
});

describe("blendColors", () => {
  it("tints dark surfaces with the darker color and their text with the lighter one", () => {
    const { base, text } = blendColors(rgb("#0f2027"), rgb("#2c5364"), true);
    const [hue] = rgbToHsl(rgb("#0f2027"));

    expect(base[0]).toBeCloseTo(hue);
    expect(base.slice(1)).toEqual([1, 0.05]);
    expect(text[0]).toBeCloseTo(rgbToHsl(rgb("#2c5364"))[0]);
    expect(text.slice(1)).toEqual([1, 0.95]);
  });

  it("tints light surfaces with the lighter color and their text with the darker one", () => {
    const { base, text } = blendColors(rgb("#e0c3fc"), rgb("#a9c9fb"), false);

    expect(base.slice(1)).toEqual([1, 0.9]);
    // A blue or purple text gets more contrast.
    expect(text.slice(1)).toEqual([1, 0.25]);
  });

  it("borrows the lighter color's hue when the darker one has none", () => {
    const { base } = blendColors(rgb("#161616"), rgb("#6b5a2e"), true);

    expect(base[0]).toBeCloseTo(rgbToHsl(rgb("#6b5a2e"))[0]);
  });
});

describe("colorThemeCss", () => {
  it("sets the variables Discord's stylesheet reads for a color theme", () => {
    const css = colorThemeCss(findColorTheme("ocean")!);

    expect(css.startsWith(`html.${THEME_CLASS} {`)).toBe(true);
    expect(css).toContain("--custom-theme-background: linear-gradient(160deg, #0f2027, #203a43, #2c5364);");
    expect(css).toContain("--custom-theme-base-color-amount: 50%;");
    expect(css).toMatch(/--custom-theme-base-color-dark: rgb\(\d+, \d+, \d+\);/);
    expect(css).toMatch(/--custom-theme-base-color-light-hsl: [\d.]+ 100% 90%;/);
  });

  it("knows each theme by its id, and no other", () => {
    expect(new Set(COLOR_THEMES.map(theme => theme.id)).size).toBe(COLOR_THEMES.length);
    expect(findColorTheme("nebula")?.scheme).toBe("dark");
    expect(findColorTheme("gone")).toBeNull();
    expect(findColorTheme(null)).toBeNull();
  });
});
