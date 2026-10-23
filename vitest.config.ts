import { configDefaults, defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";



export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: ["fake-indexeddb/auto"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/entrypoints/**", "src/lib/media/fixtures.ts"],
    },
  },
});
