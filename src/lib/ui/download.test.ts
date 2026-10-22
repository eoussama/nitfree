import { describe, expect, it } from "vitest";

import { exportName, safeFileName } from "./download";



describe("safeFileName", () => {
  it("removes characters file systems reject", () => {
    expect(safeFileName("  a/b\c:d*e?f\"g<h>i|j  ")).toBe("abcdefghij");
  });

  it("drops trailing dots and spaces, and caps the length", () => {
    expect(safeFileName("cat. . ")).toBe("cat");
    expect(safeFileName("x".repeat(300))).toHaveLength(100);
  });

  it("falls back when nothing is left", () => {
    expect(safeFileName("???")).toBe("file");
  });
});

describe("exportName", () => {
  it("dates the file", () => {
    expect(exportName(".nitfree", new Date(2026, 9, 5))).toBe("nitfree-2026-10-05.nitfree");
  });
});
