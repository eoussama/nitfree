import { describe, expect, it } from "vitest";

import { formatBytes } from "./format";



describe("formatBytes", () => {
  it("keeps small sizes in bytes", () => {
    expect(formatBytes(0, "en")).toBe("0 bytes");
    expect(formatBytes(512, "en")).toBe("512 bytes");
  });

  it("moves up a unit every thousand, with one decimal below ten", () => {
    expect(formatBytes(1500, "en")).toBe("1.5 kB");
    expect(formatBytes(3_240_000, "en")).toBe("3.2 MB");
    expect(formatBytes(48_000_000, "en")).toBe("48 MB");
    expect(formatBytes(2_000_000_000_000, "en")).toBe("2,000 GB");
  });

  it("writes it in the given language", () => {
    // French puts a narrow no-break space before the unit; any space will do here.
    expect(formatBytes(3_240_000, "fr").replace(/\s/gu, " ")).toBe("3,2 Mo");
  });

  it("goes up a unit at a thousand exactly, keeping bytes whole and units past ten without decimals", () => {
    expect(formatBytes(999, "en")).toBe("999 bytes");
    expect(formatBytes(1000, "en")).toBe("1 kB");
    expect(formatBytes(1.5, "en")).toBe("2 bytes");
    expect(formatBytes(12_340_000, "en")).toBe("12 MB");
    expect(formatBytes(9_440_000, "en")).toBe("9.4 MB");
  });

  it("treats a negative size as nothing", () => {
    expect(formatBytes(-5, "en")).toBe("0 bytes");
  });
});
