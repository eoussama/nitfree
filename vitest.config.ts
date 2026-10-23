import { svelte } from "@sveltejs/vite-plugin-svelte";
import { configDefaults, defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";



export default defineConfig({
  // Compiles the runes of the .svelte.ts files, which hold much of the interface's logic.
  plugins: [WxtVitest(), svelte({ compilerOptions: { runes: true } })],
  // Svelte's client build, so components can be mounted in tests that run with a DOM.
  resolve: { conditions: ["browser"] },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: ["fake-indexeddb/auto", "src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/test/**", "src/**/*.d.ts"],
      // Every line, branch and function is covered; anything new must be too.
      thresholds: { 100: true },
    },
  },
});
