import type { TCheck, TCheckGroup, TDiagnostics } from "./types";

import { CHECK_GROUPS } from "./types";



export type TSummary = {
  /**
   * How many checks failed.
   */
  problems: number;

  /**
   * How many still work, on a fallback.
   */
  changes: number;
};

export type TReportContext = {
  version: string;
  browser: string;
  date: Date;
};

/**
 * Counts what failed and what Discord changed.
 *
 * @param checks - The checks.
 * @returns The counts.
 */
export function summarize(checks: TCheck[]): TSummary {
  return {
    problems: checks.filter(check => check.status === "missing").length,
    changes: checks.filter(check => check.status === "fallback").length,
  };
}

/**
 * Sorts checks into their groups, in the order they are shown.
 *
 * @param checks - The checks.
 * @returns The groups that have checks, each with its checks in order.
 */
export function groupChecks(checks: TCheck[]): { group: TCheckGroup; checks: TCheck[] }[] {
  return Object.entries(CHECK_GROUPS)
    .map(([group, ids]) => ({
      group: group as TCheckGroup,
      checks: ids.flatMap(id => checks.filter(check => check.id === id)),
    }))
    .filter(entry => entry.checks.length);
}

/**
 * Writes the checks as plain text for a bug report. The checks keep their names in Nitfree's code,
 * whatever the language, so they point at what to fix; nothing about the user or their Discord is in it.
 *
 * @param diagnostics - Where the checks ran, and how each went.
 * @param context - Nitfree's version, the browser and when the checks ran.
 * @returns The report.
 */
export function formatReport(diagnostics: TDiagnostics, context: TReportContext): string {
  const lines = [
    `Nitfree ${context.version}`,
    context.browser,
    context.date.toISOString(),
    `Discord tab: ${diagnostics.tab}`,
  ];

  for (const { group, checks } of groupChecks(diagnostics.checks)) {
    lines.push("", `[${group}]`);

    for (const { id, status, alternative } of checks) {
      lines.push(`${id}: ${status}${alternative ? ` (alternative ${alternative.used} of ${alternative.of})` : ""}`);
    }
  }

  return lines.join("\n");
}
