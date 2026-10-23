import { svelte } from "@sveltejs/vite-plugin-svelte";
import { configDefaults, defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";



export default defineConfig({
  // Compiles the runes of the .svelte.ts files, which hold much of the interface's logic.
  plugins: [WxtVitest(), svelte({ compilerOptions: { runes: true } })],
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: ["fake-indexeddb/auto"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/test/**", "src/**/*.d.ts", "src/entrypoints/**", "src/lib/media/fixtures.ts"],
    },
  },
});
