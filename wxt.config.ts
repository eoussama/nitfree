import { defineConfig } from "wxt";



export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  modules: ["@wxt-dev/module-svelte", "@wxt-dev/i18n/module"],
  manifest: ({ browser }) => ({
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    permissions: ["storage"],
    host_permissions: ["*://discord.com/*"],
    // Discord's tab starts the GIF worker from a copy of its script, so it reads the script first.
    web_accessible_resources: [{ resources: ["gif-worker.js"], matches: ["*://discord.com/*"] }],
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "nitfree@ouss.es",
          strict_min_version: "140.0",
          data_collection_permissions: { required: ["none"] },
        },
        gecko_android: {
          strict_min_version: "142.0",
        },
      },
    }),
  }),
});
