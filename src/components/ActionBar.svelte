<svelte:options css="injected" />

<!--
  The quick actions above the hovered item, styled like the bar Discord shows on a hovered message:
  Favorite, Edit and, apart, Delete. It sits on the tile's top edge, and below it when there is no
  room above.
-->
<script lang="ts">
  import type { TItem } from "~/lib/db";

  import Pencil from "@lucide/svelte/icons/pencil";
  import Star from "@lucide/svelte/icons/star";
  import StarOff from "@lucide/svelte/icons/star-off";
  import Trash from "@lucide/svelte/icons/trash";

  import { sendMessage } from "~/lib/messaging";
  import { startEdit } from "~/lib/ui/editor.svelte";
  import { motion } from "~/lib/ui/motion.svelte";
  import { focusAfterRemoval } from "~/lib/ui/tiles";
  import { tooltip } from "~/lib/ui/tooltip.svelte";
  import { deleteWithUndo } from "~/lib/ui/trash.svelte";



  type TProps = {
    item: TItem;
    cell: HTMLElement;
    container: HTMLElement;
    ondone: () => void;
  };

  const { item, cell, container, ondone }: TProps = $props();

  const favoriteLabel = $derived(item.favorite ? i18n.t("menu.unfavorite") : i18n.t("menu.favorite"));

  const OVERLAP = 8;
  const MARGIN = 4;

  let element: HTMLElement | undefined = $state();
  let position = $state({ left: 0, top: 0 });
  let resized = $state(0);

  // A resized panel can change how many tiles fit a row, and so where this one sits.
  $effect(() => {
    const observer = new ResizeObserver(() => {
      resized++;
    });

    observer.observe(container);

    return () => observer.disconnect();
  });

  // Placed again whenever the library changes, as the tile may have moved, e.g. under a new Favorites row.
  $effect(() => {
    void item;
    void resized;

    if (!element) {
      return;
    }

    const box = container.getBoundingClientRect();
    const tile = cell.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = element;
    const tileTop = tile.top - box.top + container.scrollTop;
    const above = tileTop - height + OVERLAP;
    const right = tile.right - box.left + container.scrollLeft;

    position = {
      left: Math.min(Math.max(MARGIN, right - width), container.clientWidth - width - MARGIN),
      top: above >= container.scrollTop + MARGIN ? above : tileTop + tile.height - OVERLAP,
    };
  });

  function favorite(): void {
    void sendMessage("library:update", { id: item.id, patch: { favorite: !item.favorite } }).catch(() => undefined);
  }

  // Props read from the parent's state, which ondone clears, so they are read first.
  function edit(): void {
    const current = item;
    const tile = cell.querySelector<HTMLElement>("[data-tile]");

    ondone();
    startEdit(current, tile);
  }

  function remove(): void {
    const current = item;
    const tile = cell.querySelector<HTMLElement>("[data-tile]");

    ondone();

    // Focus on the tile going away moves on, never down to Discord's page.
    if (tile?.matches(":focus")) {
      focusAfterRemoval(tile);
    }

    deleteWithUndo(current);
  }

  // The buttons never take focus, so whatever had it keeps it, e.g. for a paste.
  function keepFocus(event: MouseEvent): void {
    event.preventDefault();
  }
</script>

<div
  bind:this={element}
  class="bar"
  class:reduced={motion.reduced}
  role="toolbar"
  tabindex="-1"
  aria-label={item.title}
  style:left="{position.left}px"
  style:top="{position.top}px"
>
  <button class="button" type="button" tabindex="-1" aria-label={favoriteLabel} onmousedown={keepFocus} onclick={favorite} {@attach tooltip(favoriteLabel)}>
    {#if item.favorite}
      <StarOff size={20} aria-hidden="true" />
    {:else}
      <Star size={20} aria-hidden="true" />
    {/if}
  </button>
  <button class="button" type="button" tabindex="-1" aria-label={i18n.t("menu.edit")} onmousedown={keepFocus} onclick={edit} {@attach tooltip(i18n.t("menu.edit"))}>
    <Pencil size={20} aria-hidden="true" />
  </button>
  <span class="separator" aria-hidden="true"></span>
  <button class="button danger" type="button" tabindex="-1" aria-label={i18n.t("menu.delete")} onmousedown={keepFocus} onclick={remove} {@attach tooltip(i18n.t("menu.delete"))}>
    <Trash size={20} aria-hidden="true" />
  </button>
</div>

<style>
  /* Discord's message hover bar. */
  .bar {
    position: absolute;
    z-index: 2;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 2px;
    border: 1px solid var(--border-muted, var(--nf-border, #3f4147));
    border-radius: 8px;
    background-color: var(--background-surface-high, var(--nf-bg-elevated, #2b2d31));
    box-shadow: var(--shadow-low, 0 1px 4px rgb(0 0 0 / 16%));
    outline: none;
  }

  .bar:hover {
    border-color: var(--border-subtle, var(--nf-border, #3f4147));
    box-shadow: var(--shadow-medium, 0 4px 8px rgb(0 0 0 / 20%));
  }

  .button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--interactive-icon-default, var(--nf-muted, #b5bac1));
    cursor: pointer;
  }

  .button :global(svg) {
    display: block;
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .button:hover {
    background-color: var(--interactive-background-hover, var(--nf-bg-hover, rgb(151 151 159 / 12%)));
    color: var(--interactive-icon-hover, var(--nf-text, #dbdee1));
  }

  .button:hover :global(svg) {
    transform: scale(1.1);
  }

  .button:active {
    background-color: var(--interactive-background-active, rgb(151 151 159 / 20%));
  }

  .button:active :global(svg) {
    transform: scale(1);
  }

  .danger:hover {
    color: var(--text-feedback-critical, #f57976);
  }

  .separator {
    width: 1px;
    height: 24px;
    margin: 2px 4px;
    border-radius: 100px;
    background-color: var(--border-subtle, var(--nf-border, #3f4147));
  }

  .reduced .button :global(svg) {
    transform: none;
    transition: none;
  }
</style>
