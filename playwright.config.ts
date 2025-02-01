/**
 * @see {@link https://playwright.dev/docs/chrome-extensions Chrome extensions | Playwright}
 */
import { defineConfig } from "@playwright/test";



export default defineConfig({
  retries: 2,
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    // start e2e test after the Vite server is fully prepared
    url: "http://localhost:3303/popup/main.ts",
    reuseExistingServer: true,
  }
});
