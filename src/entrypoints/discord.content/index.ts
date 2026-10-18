import { DISCORD_MATCHES } from "~/lib/discord";



export default defineContentScript({
  matches: DISCORD_MATCHES,
  runAt: "document_idle",
  main() {
    document.documentElement.dataset.nitfree = browser.runtime.getManifest().version;
  },
});
