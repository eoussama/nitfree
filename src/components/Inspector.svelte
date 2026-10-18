<svelte:options css="injected" />

<!--
  The bar under the grid that names the hovered or focused item, like Discord's emoji picker
  (":laugh_tale: from Nakama Realm").
-->
<script lang="ts">
  import type { TItem } from "~/lib/db";

  import { thumbnail } from "~/lib/ui/thumbnails";



  const { item }: { item: TItem | null } = $props();

  let url: string | null = $state(null);

  $effect(() => {
    const current = item;
    let active = true;

    url = null;

    if (current) {
      void thumbnail(current).then((found) => {
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
