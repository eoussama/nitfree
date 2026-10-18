<svelte:options css="injected" />

<!--
  One library item in the panel's grid. The thumbnail is fetched from the background only once
  the tile scrolls into view.
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
  };

  const { item, tabbable, onpick, onfocus }: TProps = $props();

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
  title={item.title}
  onclick={event => onpick(item, !event.shiftKey)}
  onfocus={onfocus}
  {@attach whenVisible}
>
  <span class="frame">
    {#if url}
      <img class="image" src={url} alt="" draggable="false" />
    {/if}
  </span>
  <span class="title">{item.title}</span>
</button>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 4px;
    border: none;
    border-radius: var(--nf-radius, 8px);
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .tile:hover {
    background: color-mix(in srgb, var(--nf-text, #dbdee1) 6%, transparent);
  }

  .tile:focus-visible {
    outline: 2px solid var(--nf-accent, #5865f2);
    outline-offset: -2px;
  }

  .frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: calc(var(--nf-radius, 8px) - 2px);
    background: color-mix(in srgb, var(--nf-text, #dbdee1) 4%, transparent);
  }

  .image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .title {
    width: 100%;
    overflow: hidden;
    font-size: 12px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--nf-muted, #949ba4);
  }
</style>
