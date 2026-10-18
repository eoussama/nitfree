import { describe, expect, it } from "vitest";

import { applyPalette, detectTheme, isReducedMotion, readPalette, schemeOf } from "./palette";
import { FALLBACK_PALETTES } from "./tokens";



describe("detectTheme", () => {
  it("picks the most specific theme class", () => {
    expect(detectTheme(["theme-dark", "theme-darker", "font-size-16"])).toBe("darker");
    expect(detectTheme(["theme-dark", "theme-onyx"])).toBe("onyx");
    expect(detectTheme(["theme-light"])).toBe("light");
  });

  it("defaults to dark", () => {
    expect(detectTheme([])).toBe("dark");
  });
});

describe("schemeOf", () => {
  it("treats every theme but light as dark", () => {
    expect(schemeOf("light")).toBe("light");
    expect(schemeOf("ash")).toBe("dark");
    expect(schemeOf("midnight")).toBe("dark");
  });
});

describe("isReducedMotion", () => {
  it("follows the OS or Discord's setting", () => {
    expect(isReducedMotion([], false)).toBe(false);
    expect(isReducedMotion([], true)).toBe(true);
    expect(isReducedMotion(["reduce-motion"], false)).toBe(true);
  });
});

describe("readPalette", () => {
  it("prefers Discord's newest variables", () => {
    const values: Record<string, string> = {
      "--background-base-lower": " #1a1a1e ",
      "--background-primary": "#313338",
      "--brand-500": "#ff0000",
    };
    const palette = readPalette(variable => values[variable] ?? "", "dark");

    expect(palette.bg).toBe("#1a1a1e");
    expect(palette.accent).toBe("#ff0000");
  });

  it("falls back to legacy variables, then to the scheme's defaults", () => {
    const values: Record<string, string> = { "--background-primary": "#222222" };
    const palette = readPalette(variable => values[variable] ?? "", "light");

    expect(palette.bg).toBe("#222222");
    expect(palette.text).toBe(FALLBACK_PALETTES.light.text);
    expect(palette.radius).toBe(FALLBACK_PALETTES.light.radius);
  });
});

describe("applyPalette", () => {
  it("sets every Nitfree variable and the motion flag", () => {
    const properties = new Map<string, string>();
    const target = {
      dataset: {} as DOMStringMap,
      style: { setProperty: (name: string, value: string) => properties.set(name, value) } as unknown as CSSStyleDeclaration,
    };

    applyPalette(target, FALLBACK_PALETTES.dark, true);

    expect(properties.get("--nf-bg")).toBe(FALLBACK_PALETTES.dark.bg);
    expect(properties.get("--nf-bg-elevated")).toBe(FALLBACK_PALETTES.dark.bgElevated);
    expect(properties.size).toBe(7);
    expect(target.dataset.nfReducedMotion).toBe("true");
  });
});
