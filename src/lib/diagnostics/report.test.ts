import type { TCheck } from "./types";

import { describe, expect, it } from "vitest";

import { formatReport, groupChecks, summarize } from "./report";



const CHECKS: TCheck[] = [
  { id: "theme", status: "ok" },
  { id: "chatButtonGroup", status: "fallback", alternative: { used: 2, of: 2 } },
  { id: "background", status: "ok" },
  { id: "composer", status: "ok" },
  { id: "toggler", status: "missing" },
  { id: "pickerTab", status: "skipped" },
  { id: "composerBox", status: "fallback", alternative: { used: 2, of: 3 } },
];

describe("summarize", () => {
  it("counts what failed and what works on a fallback", () => {
    expect(summarize(CHECKS)).toEqual({ problems: 1, changes: 2 });
    expect(summarize([])).toEqual({ problems: 0, changes: 0 });
  });
});

describe("groupChecks", () => {
  it("sorts the checks into their groups, in the order they are shown, leaving out empty groups", () => {
    expect(groupChecks(CHECKS)).toEqual([
      { group: "extension", checks: [{ id: "background", status: "ok" }] },
      {
        group: "composer",
        checks: [
          { id: "composer", status: "ok" },
          { id: "composerBox", status: "fallback", alternative: { used: 2, of: 3 } },
          { id: "chatButtonGroup", status: "fallback", alternative: { used: 2, of: 2 } },
          { id: "toggler", status: "missing" },
        ],
      },
      { group: "theme", checks: [{ id: "theme", status: "ok" }] },
      { group: "picker", checks: [{ id: "pickerTab", status: "skipped" }] },
    ]);
  });
});

describe("formatReport", () => {
  it("lists every check under its group, after Nitfree's version, the browser, the time and the tab", () => {
    const report = formatReport({ tab: "found", checks: CHECKS }, { version: "1.2.3", browser: "Firefox 140", date: new Date(Date.UTC(2026, 9, 25, 10, 30)) });

    expect(report).toBe([
      "Nitfree 1.2.3",
      "Firefox 140",
      "2026-10-25T10:30:00.000Z",
      "Discord tab: found",
      "",
      "[extension]",
      "background: ok",
      "",
      "[composer]",
      "composer: ok",
      "composerBox: fallback (alternative 2 of 3)",
      "chatButtonGroup: fallback (alternative 2 of 2)",
      "toggler: missing",
      "",
      "[theme]",
      "theme: ok",
      "",
      "[picker]",
      "pickerTab: skipped",
    ].join("\n"));
  });

  it("says where the checks could not run", () => {
    expect(formatReport({ tab: "none", checks: [] }, { version: "1.2.3", browser: "Chrome", date: new Date(0) })).toBe("Nitfree 1.2.3\nChrome\n1970-01-01T00:00:00.000Z\nDiscord tab: none");
  });
});
