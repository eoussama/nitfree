<svelte:options css="injected" />

<!--
  The Nitfree button in Discord's chat bar. It borrows the classes of Discord's own buttons,
  so it has their size and hover and active states; it only falls back to its own layout when
  Discord's markup has changed. Its tooltip names the keyboard shortcut that does the same.
-->
<script lang="ts">
  import type { TChatButtonClasses } from "~/lib/discord";

  import { ariaShortcut, shortcutKeys } from "~/lib/shortcut";
  import { notePress, noteRelease, panel, togglePanel } from "~/lib/ui/panel.svelte";
  import { preferences } from "~/lib/ui/preferences.svelte";
  import { tooltip } from "~/lib/ui/tooltip.svelte";

  import Logo from "./Logo.svelte";



  const { classes }: { classes: TChatButtonClasses } = $props();

  let button: HTMLElement | undefined = $state();

  const open = $derived(panel.open && button !== undefined && panel.anchor === button);
  const keys = $derived(preferences.shortcut ? shortcutKeys(preferences.shortcut) : []);

  function toggle(): void {
    if (button) {
      togglePanel(button);
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (button) {
        notePress(button);
      }

      toggle();
    }
  }
</script>

<div class="container {classes.container}" class:fallback={!classes.button} data-nitfree-toggler>
  <div
    bind:this={button}
    class="button {classes.button}"
    role="button"
    tabindex="0"
    aria-label={i18n.t("toggler.label")}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-keyshortcuts={preferences.shortcut ? ariaShortcut(preferences.shortcut) : undefined}
    {@attach tooltip(i18n.t("toggler.label"), "top", keys)}
    onpointerdown={() => button && notePress(button)}
    onpointerup={() => button && noteRelease(button)}
    onclick={toggle}
    onkeydown={onKeydown}
  >
    <div class="wrapper {classes.wrapper}">
      <span class="logo"><Logo /></span>
    </div>
  </div>
</div>

<style>
  /* Discord draws 24px icons whose glyph fills about 20px; a solid logo looks right at that size. */
  .logo {
    display: block;
    width: 20px;
    height: 20px;
    filter: grayscale(1) brightness(1.15);
    opacity: 0.85;
    transform: scale(1);
    transition:
      filter 0.2s ease-out,
      opacity 0.2s ease-out,
      transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .button:hover .logo,
  .button:focus-visible .logo,
  .button[aria-expanded="true"] .logo {
    filter: none;
    opacity: 1;
    transform: scale(1.12);
  }

  .button:hover :global(.eye) {
    animation: blink 0.3s ease-in-out;
  }

  /* A second keyframe name so opening blinks again even while the pointer is still on the button. */
  .button[aria-expanded="true"] :global(.eye) {
    animation: blink-open 0.3s ease-in-out;
  }

  @keyframes blink {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(0.1); }
  }

  @keyframes blink-open {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(0.1); }
  }

  :global(html[data-nf-reduced-motion="true"]) .logo {
    transition: none;
  }

  :global(html[data-nf-reduced-motion="true"]) .button :global(.eye) {
    animation: none;
  }

  .fallback {
    display: flex;
    align-items: center;
  }

  .fallback .button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    cursor: pointer;
  }
</style>
