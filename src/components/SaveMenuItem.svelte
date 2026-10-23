<svelte:options css="injected" />

<!--
  "Save to Nitfree" in Discord's context menu, first in its own group. It borrows the classes,
  font and icon size of Discord's menu items, puts its icon on the same side as theirs, and takes
  their highlight while hovered or focused; it only falls back to its own layout when Discord's
  markup has changed.
-->
<script lang="ts">
  import type { TMenuLook } from "~/lib/discord";

  import Logo from "./Logo.svelte";



  const { look, onselect }: { look: TMenuLook; onselect: () => void } = $props();

  let highlighted = $state(false);

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onselect();
    }
  }
</script>

{#snippet icon()}
  <div class={look.iconContainer}>
    <span class="logo {look.icon}" class:lit={highlighted} style:width="{look.iconSize}px" style:height="{look.iconSize}px"><Logo /></span>
  </div>
{/snippet}

<div role="group" data-nitfree-save>
  <div
    class="item {look.item} {highlighted ? look.focused : ""}"
    class:fallback={!look.item}
    class:icon-first={look.iconFirst}
    role="menuitem"
    tabindex="0"
    onpointerenter={() => (highlighted = true)}
    onpointerleave={() => (highlighted = false)}
    onfocus={() => (highlighted = true)}
    onblur={() => (highlighted = false)}
    onclick={onselect}
    onkeydown={onKeydown}
  >
    {#if look.iconFirst}
      {@render icon()}
    {/if}
    <div class={look.label} style={look.font}>{i18n.t("save.menuItem")}</div>
    {#if !look.iconFirst}
      {@render icon()}
    {/if}
  </div>
</div>
<div class={look.separator} role="separator"></div>

<style>
  .item:focus {
    outline: none;
  }

  /* Discord's left icons sit next to their label rather than at the far end. */
  .icon-first {
    justify-content: flex-start;
  }

  /* Discord's icons are one color; the logo stays gray until its item is highlighted, as in the chat bar. */
  .logo {
    display: block;
    flex: none;
    filter: grayscale(1) brightness(1.15);
    opacity: 0.85;
    transition: filter 0.2s ease-out, opacity 0.2s ease-out;
  }

  .logo.lit {
    filter: none;
    opacity: 1;
  }

  :global(html[data-nf-reduced-motion="true"]) .logo {
    transition: none;
  }

  .fallback {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px;
    cursor: pointer;
  }
</style>
