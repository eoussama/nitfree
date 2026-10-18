import { DISCORD_MATCHES } from "~/lib/discord";
import { applyPalette, themeSnapshot, watchTheme } from "~/lib/theme";
import { mountPopover, mountToggler, watchChatButtonGroups } from "~/lib/ui/inject";
import { followLibrary } from "~/lib/ui/library.svelte";



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
    const stopLibrary = followLibrary();
    const removePopover = mountPopover();
    const stopTogglers = watchChatButtonGroups(ctx, mountToggler);

    ctx.onInvalidated(() => {
      stopTheme();
      stopTogglers();
      removePopover();
      stopLibrary();
    });
  },
});
