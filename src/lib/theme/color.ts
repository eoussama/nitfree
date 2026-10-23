/**
 * A color as red, green and blue, from 0 to 255.
 */
export type TRgb = [number, number, number];

/**
 * A color as hue in degrees, then saturation and lightness from 0 to 1.
 */
export type THsl = [number, number, number];

/**
 * Reads a `#rrggbb` color.
 *
 * @param hex - The color.
 * @returns Its channels, or null for anything else.
 */
export function hexToRgb(hex: string): TRgb | null {
  if (!/^#[\da-f]{6}$/i.test(hex)) {
    return null;
  }

  return [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16)) as TRgb;
}

/**
 * Turns a color into hue, saturation and lightness. A gray has no hue, given as 0.
 *
 * @param rgb - The color.
 * @returns The color as HSL.
 */
export function rgbToHsl(rgb: TRgb): THsl {
  const [r, g, b] = rgb.map(channel => channel / 255) as TRgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return [0, 0, lightness];
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;

  return [(hue * 60 + 360) % 360, Math.min(saturation, 1), lightness];
}

/**
 * Turns hue, saturation and lightness back into a color.
 *
 * @param hsl - The color as HSL.
 * @returns The color, rounded to whole channels.
 */
export function hslToRgb(hsl: THsl): TRgb {
  const [hue, saturation, lightness] = hsl;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const step = hue / 60;
  const x = chroma * (1 - Math.abs((step % 2) - 1));
  const m = lightness - chroma / 2;
  const [r, g, b] = step < 1 ? [chroma, x, 0] : step < 2 ? [x, chroma, 0] : step < 3 ? [0, chroma, x] : step < 4 ? [0, x, chroma] : step < 5 ? [x, 0, chroma] : [chroma, 0, x];

  return [r, g, b].map(channel => Math.round((channel + m) * 255)) as TRgb;
}

/**
 * How light a color looks, as WCAG measures it.
 *
 * @param rgb - The color.
 * @returns From 0, black, to 1, white.
 */
export function luminance(rgb: TRgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as TRgb;

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
