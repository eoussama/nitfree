<svelte:options css="injected" />

<!--
  The quick actions above the hovered item, styled like the bar Discord shows on a hovered message:
  Favorite, Details, Edit, Download and, apart, Delete. It floats a little above the tile, or below it when there is no
  room above, and goes once the pointer leaves both. The gap between them still counts as the bar, so
  moving up to it never passes over the tile above.
-->
<script lang="ts">
  import type { TItem } from "~/lib/db";

  import Download from "@lucide/svelte/icons/download";
  import Eye from "@lucide/svelte/icons/eye";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Star from "@lucide/svelte/icons/star";
  import StarOff from "@lucide/svelte/icons/star-off";
  import Trash from "@lucide/svelte/icons/trash";

  import { sendMessage } from "~/lib/messaging";
  import { openDetails } from "~/lib/ui/details.svelte";
  import { startEdit } from "~/lib/ui/editor.svelte";
  import { saveItem } from "~/lib/ui/export";
  import { motion } from "~/lib/ui/motion.svelte";
  import { focusAfterRemoval } from "~/lib/ui/tiles";
  import { tooltip } from "~/lib/ui/tooltip.svelte";
  import { deleteWithUndo } from "~/lib/ui/trash.svelte";



  type TProps = {
    item: TItem;
    cell: HTMLElement;
    // What the bar is placed in, and the area it stays within sideways: the grid, not the sidebar.
    container: HTMLElement;
    bounds: HTMLElement;
    ondone: () => void;
  };

  const { item, cell, container, bounds, ondone }: TProps = $props();

  const favoriteLabel = $derived(item.favorite ? i18n.t("menu.unfavorite") : i18n.t("menu.favorite"));

  // The gap between the tile and the bar, which still belongs to the bar's hover zone.
  const GAP = 6;
  const MARGIN = 4;

  let element: HTMLElement | undefined = $state();
  // Hidden until placed, so it never shows, nor takes the pointer, where it does not belong.
  let position: { left: number; top: number } | null = $state(null);
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
    const area = bounds.getBoundingClientRect();
    const tile = cell.getBoundingClientRect();
    // The zone's size, its padding included: the bar plus a gap above and below.
    const { offsetWidth: width, offsetHeight: height } = element;
    const tileTop = tile.top - box.top;
    const above = tileTop - height;
    const start = area.left - box.left + MARGIN;
    const end = area.left - box.left + bounds.clientWidth - width - MARGIN;

    position = {
      left: Math.min(Math.max(start, tile.right - box.left - width), end),
      top: above + GAP >= MARGIN ? above : tileTop + tile.height,
    };
  });

  function favorite(): void {
    void sendMessage("library:update", { id: item.id, patch: { favorite: !item.favorite } }).catch(() => undefined);
  }

  // Props read from the parent's state, which ondone clears, so they are read first.
  function view(): void {
    const current = item;
    const tile = cell.querySelector<HTMLElement>("[data-tile]");

    ondone();
    openDetails(current, tile);
  }

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

  // Back onto the tile keeps the bar; anywhere else, it goes.
  function onLeave(event: PointerEvent): void {
    if (!(event.relatedTarget instanceof Node && cell.contains(event.relatedTarget))) {
      ondone();
    }
  }
</script>

<div
  bind:this={element}
  class="zone"
  data-action-bar
  role="presentation"
  style:left="{position?.left ?? 0}px"
  style:top="{position?.top ?? 0}px"
  style:visibility={position ? null : "hidden"}
  style:padding="{GAP}px 0"
  onpointerleave={onLeave}
>
  <div
    class="bar"
    class:reduced={motion.reduced}
    role="toolbar"
    tabindex="-1"
    aria-label={item.title}
  >
    <button class="button" type="button" tabindex="-1" aria-label={favoriteLabel} onmousedown={keepFocus} onclick={favorite} {@attach tooltip(favoriteLabel)}>
      {#if item.favorite}
        <StarOff size={20} aria-hidden="true" />
      {:else}
        <Star size={20} aria-hidden="true" />
      {/if}
    </button>
    <button class="button" type="button" tabindex="-1" aria-label={i18n.t("menu.details")} onmousedown={keepFocus} onclick={view} {@attach tooltip(i18n.t("menu.details"))}>
      <Eye size={20} aria-hidden="true" />
    </button>
    <button class="button" type="button" tabindex="-1" aria-label={i18n.t("menu.edit")} onmousedown={keepFocus} onclick={edit} {@attach tooltip(i18n.t("menu.edit"))}>
      <Pencil size={20} aria-hidden="true" />
    </button>
    <button class="button" type="button" tabindex="-1" aria-label={i18n.t("menu.download")} onmousedown={keepFocus} onclick={() => void saveItem(item)} {@attach tooltip(i18n.t("menu.download"))}>
      <Download size={20} aria-hidden="true" />
    </button>
    <span class="separator" aria-hidden="true"></span>
    <button class="button danger" type="button" tabindex="-1" aria-label={i18n.t("menu.delete")} onmousedown={keepFocus} onclick={remove} {@attach tooltip(i18n.t("menu.delete"))}>
      <Trash size={20} aria-hidden="true" />
    </button>
  </div>
</div>

<style>
  .zone {
    position: absolute;
    z-index: 2;
  }

  /* Discord's message hover bar. */
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
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
    padding: 4px;
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
