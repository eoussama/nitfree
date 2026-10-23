import type { TSnippet } from "~/lib/theme";

import { DISCORD_MATCHES } from "~/lib/discord";
import { accentColor, cssSnippets } from "~/lib/settings";
import { applyPalette, captureDiscordFont, themeSnapshot, themeStyles, watchTheme } from "~/lib/theme";
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

    // Its styles go in Discord's <head>, where the theme watcher sees them and reads the palette they make.
    const stopCustomTheme = followCustomTheme();
    const stopTheme = watchTheme(root, (snapshot) => {
      applyPalette(root, snapshot.palette, snapshot.reducedMotion);
      void themeSnapshot.setValue(snapshot);
    });
    const stopContent = startContent(ctx);

    // Once Discord has settled, keep its typeface for the popup; the files are already in the browser's cache by then.
    ctx.setTimeout(() => void captureDiscordFont().catch(() => undefined), FONT_DELAY);

    ctx.onInvalidated(() => {
      stopCustomTheme();
      stopTheme();
      stopContent();
    });
  },
});

/**
 * Gives Discord the accent color and CSS snippets set in the popup, following every change at once.
 *
 * @returns A function that stops, putting Discord back as it was.
 */
function followCustomTheme(): () => void {
  const styles = themeStyles(document);
  let accent: string | null = null;
  let snippets: TSnippet[] = [];
  let stopped = false;

  const render = (): void => {
    if (!stopped) {
      styles.render(accent, snippets);
    }
  };

  void Promise.all([accentColor.getValue(), cssSnippets.getValue()]).then(([color, list]) => {
    accent = color;
    snippets = list;
    render();
  });

  const stops = [
    accentColor.watch((color) => {
      accent = color;
      render();
    }),
    cssSnippets.watch((list) => {
      snippets = list ?? [];
      render();
    }),
  ];

  return () => {
    stopped = true;
    stops.forEach(stop => stop());
    styles.stop();
  };
}
