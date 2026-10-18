export default defineContentScript({
  matches: ["*://discord.com/*"],
  runAt: "document_idle",
  main() {
    document.documentElement.dataset.nitfree = browser.runtime.getManifest().version;
  },
});
