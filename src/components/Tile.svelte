<svelte:options css="injected" />

<!--
  One library item in the panel's grid, a square cell like Discord's emoji picker: no caption; the
  name shows in the inspector bar when the cell is hovered or focused. The thumbnail is fetched from
  the background only once the cell scrolls into view.
-->
<script lang="ts">
  import type { TItem } from "~/lib/db";

  import { untrack } from "svelte";

  import { thumbnail } from "~/lib/ui/thumbnails";



  type TProps = {
    item: TItem;
    tabbable: boolean;
    onpick: (item: TItem, send: boolean) => void;
    onfocus: () => void;
    oninspect: (item: TItem) => void;
  };

  const { item, tabbable, onpick, onfocus, oninspect }: TProps = $props();

  let url: string | null = $state(null);

  // The library reloads as new objects on every change; only a new file should refetch the thumbnail.
  const hash = $derived(item.hash);

  // Reading the hash here re-runs the attachment, and so fetches the thumbnail again, when the file changes.
  function whenVisible(node: HTMLElement): () => void {
    void hash;

    const current = untrack(() => item);

    let active = true;

    url = null;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        void thumbnail(current).then((found) => {
          // A newer file may have replaced this one while it loaded.
          if (active) {
            url = found;
          }
        });
      }
    });

    observer.observe(node);

    return () => {
      active = false;
      observer.disconnect();
    };
  }
</script>

<button
  class="tile"
  type="button"
  data-tile={item.id}
  tabindex={tabbable ? 0 : -1}
  aria-label={item.title}
  onclick={event => onpick(item, !event.shiftKey)}
  onfocus={() => {
    onfocus();
    oninspect(item);
  }}
  onpointerenter={() => oninspect(item)}
  {@attach whenVisible}
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
  }
</style>
