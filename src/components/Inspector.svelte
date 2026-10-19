<svelte:options css="injected" />

<!--
  The bar under the grid that names the hovered or focused item, like Discord's emoji picker
  (":laugh_tale: from Nakama Realm").
-->
<script lang="ts">
  import type { TItem } from "~/lib/db";

  import { still, thumbnail } from "~/lib/ui/thumbnails";



  type TProps = {
    item: TItem | null;
    // Whether the item is the one hovered or focused, so an animated one plays.
    animate?: boolean;
  };

  const { item, animate = false }: TProps = $props();

  let url: string | null = $state(null);
  let shownId: string | null = null;

  $effect(() => {
    const current = item;
    const playing = animate && current?.animated;
    let active = true;

    // Switching between the still and the animation keeps the image until the other is ready.
    if (current?.id !== shownId) {
      url = null;
      shownId = current?.id ?? null;
    }

    if (current) {
      void (playing ? thumbnail(current) : still(current)).then((found) => {
        if (active) {
          url = found;
        }
      });
    }

    return () => {
      active = false;
    };
  });
</script>

<!-- Visual only: every tile already carries its name for assistive tech. -->
<div class="inspector" data-inspector aria-hidden="true">
  {#if item}
    <span class="graphic">
      {#if url}
        <img class="image" src={url} alt="" draggable="false" />
      {/if}
    </span>
    <span class="text">
      <span class="title">:{item.title}:</span>
      <span class="subtitle">{i18n.t(`panel.types.${item.type}`)}{item.animated ? ` · ${i18n.t("panel.animated")}` : ""}</span>
    </span>
  {/if}
</div>

<style>
  /* Discord's inspector bar under the emoji grid. */
  .inspector {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 48px;
    padding: 0 16px;
    overflow: hidden;
    border-top: 1px solid var(--border-normal, var(--nf-border, #3f4147));
    background-color: var(--background-base-lower, var(--nf-bg, #313338));
  }

  .graphic {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
  }

  .image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .title,
  .subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    font-size: 16px;
    font-weight: 600;
    line-height: 20px;
    color: var(--text-default, var(--nf-text, #f2f3f5));
  }

  .subtitle {
    font-size: 12px;
    line-height: 16px;
    color: var(--interactive-text-default, var(--nf-muted, #949ba4));
  }
</style>
