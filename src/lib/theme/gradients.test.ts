import { describe, expect, it } from "vitest";

import { hexToRgb, hslToRgb, luminance, rgbToHsl } from "./color";
import { blendColors, COLOR_THEMES, colorThemeCss, findColorTheme, THEME_CLASS } from "./gradients";



const rgb = (hex: string) => hexToRgb(hex)!;

describe("colors", () => {
  it("go to HSL and back", () => {
    // One from each sixth of the hue wheel, and a gray.
    for (const hex of ["#5865f2", "#ff0000", "#ff8000", "#80ff00", "#00ff80", "#0080ff", "#8000ff", "#ff0080", "#0f4c45", "#fdf6c3", "#808080"]) {
      expect(hslToRgb(rgbToHsl(rgb(hex)))).toEqual(rgb(hex));
    }
  });

  it("refuse anything but #rrggbb", () => {
    expect(hexToRgb("#abc")).toBeNull();
    expect(hexToRgb("blue")).toBeNull();
  });

  it("measure how light they look, for dark colors by the linear part of the curve", () => {
    expect(luminance(rgb("#000000"))).toBe(0);
    expect(luminance(rgb("#ffffff"))).toBeCloseTo(1);
    expect(luminance(rgb("#010101"))).toBeCloseTo(0.0003, 4);
    expect(luminance(rgb("#00ff00"))).toBeGreaterThan(luminance(rgb("#ff0000")));
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

describe("colorThemeCss for themes of its own making", () => {
  it("makes a gradient of a lone color, and takes one it cannot read for black", () => {
    expect(colorThemeCss({ id: "peach", scheme: "light", angle: 90, colors: ["#ff8000"] })).toContain("linear-gradient(90deg, #ff8000, #ff8000)");
    expect(colorThemeCss({ id: "peach", scheme: "light", angle: 90, colors: ["nope", "#ff8000"] })).toContain("--custom-theme-primary-color: nope;");
  });

  it("takes the last color for the first when it cannot be read", () => {
    expect(colorThemeCss({ id: "peach", scheme: "light", angle: 90, colors: ["#ff8000", "nope"] })).toContain("--custom-theme-secondary-color: nope;");
  });

  it("gives blues and purples less extreme text, on dark surfaces too", () => {
    expect(blendColors(rgb("#4b2a8a"), rgb("#120c2c"), true).text[2]).toBe(0.8);
  });

  it("keeps a pink's text as light as any outside blue", () => {
    expect(blendColors(rgb("#ff0080"), rgb("#800040"), true).text[2]).toBe(0.95);
  });

  it("gives light text on dark surfaces and dark text on light ones, outside blue", () => {
    const { text: dark } = blendColors(rgb("#8a3b12"), rgb("#1f0a0a"), true);
    const { text: light } = blendColors(rgb("#ffecd2"), rgb("#fcb69f"), false);

    expect(dark[2]).toBe(0.95);
    expect(light[2]).toBe(0.15);
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

describe("blendColors and colorThemeCss, in detail", () => {
  it("lends surfaces the darker color's hue and text the lighter's in dark themes, whichever comes first", () => {
    const yellow = rgb("#ffff00");
    const navy = rgb("#000080");

    expect(blendColors(yellow, navy, true)).toEqual({ base: [240, 1, 0.05], text: [60, 1, 0.95] });
    expect(blendColors(navy, yellow, true)).toEqual({ base: [240, 1, 0.05], text: [60, 1, 0.95] });
  });

  it("gives text more contrast from the first blue to the last purple", () => {
    const black = rgb("#000000");

    expect(blendColors(rgb("#00aaff"), black, true).text).toEqual([200, 1, 0.8]);
    expect(blendColors(rgb("#ff00ff"), black, true).text).toEqual([300, 1, 0.8]);
  });

  it("writes the gradient's last color, black for a color it cannot read, and the dark and light colors apart", () => {
    const css = colorThemeCss({ id: "x" as never, scheme: "dark", angle: 90, colors: ["#ff0000", "#00ff00", "#0000ff"] });

    expect(css).toContain("--custom-theme-secondary-color: #0000ff;");
    expect(css).toContain("--custom-background-gradient-opacity-multiplier: 1;\n  --custom-theme-base-color-amount: 50%;\n  --custom-theme-text-color-amount: 38%;");
    expect(css).toMatch(/--custom-theme-base-color-dark-hsl: \d+ 100% 5%;/);
    expect(css).toMatch(/--custom-theme-base-color-light-hsl: \d+ 100% 90%;/);
    expect(colorThemeCss({ id: "x" as never, scheme: "dark", angle: 0, colors: ["bad", "#ffffff"] })).not.toContain("NaN");
  });
});
