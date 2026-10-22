import { DISCORD_MATCHES } from "~/lib/discord";
import { applyPalette, captureDiscordFont, themeSnapshot, watchTheme } from "~/lib/theme";
import { startContent } from "~/lib/ui/content";



/**
 * How long after Discord opens its typeface is copied for the popup.
 */
const FONT_DELAY = 5000;

export default defineContentScript({
  matches: DISCORD_MATCHES,
  runAt: "document_idle",
  main(ctx) {
    const root = document.documentElement;

    root.dataset.nitfree = browser.runtime.getManifest().version;

    const stopTheme = watchTheme(root, (snapshot) => {
      applyPalette(root, snapshot.palette, snapshot.reducedMotion);
      void themeSnapshot.setValue(snapshot);
    });
    const stopContent = startContent(ctx);

    // Once Discord has settled, keep its typeface for the popup; the files are already in the browser's cache by then.
    ctx.setTimeout(() => void captureDiscordFont().catch(() => undefined), FONT_DELAY);

    ctx.onInvalidated(() => {
      stopTheme();
      stopContent();
    });
  },
});
