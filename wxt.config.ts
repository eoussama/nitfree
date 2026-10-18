import { defineConfig } from "wxt";



export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "Nitfree",
    description: "The definitive freemium Discord Nitro alternative",
    permissions: ["storage"],
    host_permissions: ["*://discord.com/*"],
  },
});
