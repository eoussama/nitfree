/**
 * Mutation testing: Stryker changes the code in small ways, one at a time, and checks that some unit
 * test fails each time. A change no test notices shows code the tests run without really checking.
 *
 * @type {import("@stryker-mutator/api/core").PartialStrykerOptions}
 */
export default {
  testRunner: "vitest",
  // Named, as pnpm keeps plugins where Stryker does not look for them.
  plugins: ["@stryker-mutator/vitest-runner"],
  // Each change runs the tests that reach it, found from the coverage, rather than from the files that
  // import it, which Vitest cannot work out from the sandbox's Windows paths.
  vitest: { configFile: "vitest.config.ts", related: false },
  mutate: ["src/**/*.ts", "!src/**/*.test.ts", "!src/test/**", "!src/**/*.d.ts"],
  // Each change runs only the tests that reach it.
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  // Later runs only test the mutants of code or tests that changed since the last one.
  incremental: true,
  incrementalFile: "reports/mutation/incremental.json",
  // Below the score of the first full run, the run fails, so it can only go up.
  thresholds: { high: 90, low: 80, break: 85 },
  tempDirName: ".stryker-tmp",
  cleanTempDir: "always",
};
