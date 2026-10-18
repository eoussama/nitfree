import { DISCORD_MATCHES } from "~/lib/discord";
import { applyPalette, themeSnapshot, watchTheme } from "~/lib/theme";
import { startContent } from "~/lib/ui/content";



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

    ctx.onInvalidated(() => {
      stopTheme();
      stopContent();
    });
  },
});
