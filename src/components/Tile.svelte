<svelte:options css="injected" />

<!--
  One library item in the panel's grid, a square cell like Discord's emoji picker: no caption; the
  name shows in the inspector bar when the cell is hovered or focused. It shows a small still once it
  scrolls into view; an animated item plays only while hovered or focused. The image lifts a little
  on hover, unless Discord asks for reduced motion.
-->
<script lang="ts">
  import type { TItem } from "~/lib/db";

  import { untrack } from "svelte";

  import { motion } from "~/lib/ui/motion.svelte";
  import { still, thumbnail, whenVisible } from "~/lib/ui/thumbnails";



  type TProps = {
    item: TItem;
    tabbable: boolean;
    onpick: (item: TItem, send: boolean) => void;
    onfocus: () => void;
    oninspect: (item: TItem) => void;
  };

  const { item, tabbable, onpick, onfocus, oninspect }: TProps = $props();

  let stillUrl: string | null = $state(null);
  let playingUrl: string | null = $state(null);
  let hovered = $state(false);
  let focused = $state(false);

  // The library reloads as new objects on every change; only a new file should refetch the images.
  const hash = $derived(item.hash);
  const playing = $derived(item.animated && (hovered || focused));
  const url = $derived(playing && playingUrl ? playingUrl : stillUrl);

  // Reading the hash here re-runs the attachment, and so fetches the still again, when the file changes.
  function loadWhenVisible(node: HTMLElement): () => void {
    void hash;

    const current = untrack(() => item);

    let active = true;

    stillUrl = null;
    playingUrl = null;

    const stop = whenVisible(node, () => {
      void still(current).then((found) => {
        // A newer file may have replaced this one while it loaded.
        if (active) {
          stillUrl = found;
        }
      });
    });

    return () => {
      active = false;
      stop();
    };
  }

  // The animation is only fetched the first time the item is hovered or focused.
  $effect(() => {
    if (!playing || playingUrl) {
      return;
    }

    let active = true;

    void thumbnail(untrack(() => item)).then((found) => {
      if (active) {
        playingUrl = found;
      }
    });

    return () => {
      active = false;
    };
  });
</script>

<button
  class="tile"
  class:reduced={motion.reduced}
  type="button"
  data-tile={item.id}
  tabindex={tabbable ? 0 : -1}
  aria-label={item.title}
  onclick={event => onpick(item, !event.shiftKey)}
  onfocus={() => {
    focused = true;
    onfocus();
    oninspect(item);
  }}
  onblur={() => {
    focused = false;
  }}
  onpointerenter={() => {
    hovered = true;
    oninspect(item);
  }}
  onpointerleave={() => {
    hovered = false;
  }}
  {@attach loadWhenVisible}
>
  {#if url}
    <img class="image" src={url} alt="" draggable="false" />
  {/if}
</button>

<style>
  /* Discord's emoji cell: 48 px with a 4 px gutter around a 40 px image. */
  .tile {
    position: relative;
    display: block;
    width: 48px;
    height: 48px;
    padding: 4px;
    border: none;
    border-radius: 4px;
    background: none;
    cursor: pointer;
    outline: none;
  }

  .tile:hover,
  .tile:focus-visible {
    background-color: var(--interactive-background-selected, var(--nf-bg-hover, rgb(151 151 159 / 20%)));
  }

  .tile:focus-visible::before {
    position: absolute;
    inset: 0;
    border: 2px solid var(--interactive-text-hover, var(--nf-accent, #fff));
    border-radius: 4px;
    content: "";
    pointer-events: none;
  }

  .image {
    display: block;
    width: 40px;
    height: 40px;
    border-radius: 2px;
    object-fit: contain;
    pointer-events: none;
    transition: transform 0.15s ease-out;
  }

  /* The hovered item lifts toward the pointer. */
  .tile:hover .image,
  .tile:focus-visible .image {
    transform: translateY(-2px) scale(1.08);
  }

  .reduced .image,
  .reduced:hover .image,
  .reduced:focus-visible .image {
    transform: none;
    transition: none;
  }
</style>
