const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

/**
 * Writes a number of bytes the way people read them: "512 bytes", "3.2 MB", in the given language.
 *
 * @param bytes - The size.
 * @param locale - The language to write it in.
 * @returns The size, with its unit.
 */
export function formatBytes(bytes: number, locale: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;

  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }

  // One decimal while it says something, as in 3.2 MB; none for bytes or from 10 on.
  const digits = unit > 0 && value < 10 ? 1 : 0;

  return new Intl.NumberFormat(locale, { style: "unit", unit: UNITS[unit], unitDisplay: unit === 0 ? "long" : "short", maximumFractionDigits: digits }).format(value);
}
