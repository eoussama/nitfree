<svelte:options css="injected" />

<!--
  The details dialog, styled like a Discord modal: a large preview, then everything the edit dialog
  holds, read only, with what Nitfree knows about the file. Its footer favorites, downloads or edits
  the item. Clicking the preview shows it larger, with zoom.
-->
<script lang="ts">
  import Download from "@lucide/svelte/icons/download";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Star from "@lucide/svelte/icons/star";
  import StarOff from "@lucide/svelte/icons/star-off";
  import Tag from "@lucide/svelte/icons/tag";
  import X from "@lucide/svelte/icons/x";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";
  import { untrack } from "svelte";

  import { formatBytes } from "~/lib/format";
  import { sendMessage } from "~/lib/messaging";
  import { closeDetails, details, detailsItem, editFromDetails } from "~/lib/ui/details.svelte";
  import { saveItem } from "~/lib/ui/export";
  import { library } from "~/lib/ui/library.svelte";
  import { thumbnail } from "~/lib/ui/thumbnails";

  import Lightbox from "./Lightbox.svelte";



  const locale = i18n.t("locale");
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  let dialog: HTMLElement | undefined = $state();
  let previewButton: HTMLButtonElement | undefined = $state();
  let url: string | null = $state(null);
  let enlarged = $state(false);

  const item = $derived(detailsItem());
  const tags = $derived(item ? item.tags.flatMap(id => library.tags.find(tag => tag.id === id) ?? []) : []);
  const favoriteLabel = $derived(item?.favorite ? i18n.t("menu.unfavorite") : i18n.t("menu.favorite"));

  // The item went away while shown, e.g. deleted from another tab.
  $effect(() => {
    if (details.id && library.loaded && !item) {
      closeDetails();
    }
  });

  // Changes only with the file, not with every library reload, such as after a favorite toggle.
  const file = $derived(item ? `${item.id}:${item.hash}` : null);

  // The original file, so an animated item plays.
  $effect(() => {
    void file;

    const current = untrack(() => item);
    let active = true;

    url = null;
    enlarged = false;

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

  $effect(() => {
    if (details.id && dialog) {
      dialog.querySelector<HTMLElement>("[data-primary]")?.focus();
    }
  });

  function favorite(): void {
    if (item) {
      void sendMessage("library:update", { id: item.id, patch: { favorite: !item.favorite } }).catch(() => undefined);
    }
  }

  function closeLightbox(): void {
    enlarged = false;
    previewButton?.focus();
  }
</script>

{#if item}
  <div class="backdrop" aria-hidden="true" onpointerdown={() => closeDetails()}></div>
  <div bind:this={dialog} class="modal" role="dialog" aria-modal="true" aria-labelledby="nf-details-title" tabindex="-1">
    <header class="modal-header">
      <h2 class="modal-title" id="nf-details-title">:{item.title}:</h2>
      <button class="close" type="button" aria-label={i18n.t("details.close")} onclick={() => closeDetails()}>
        <X size={24} aria-hidden="true" />
      </button>
    </header>

    <div class="modal-content">
      <button
        bind:this={previewButton}
        class="preview"
        type="button"
        aria-label={i18n.t("details.enlarge")}
        disabled={!url}
        onclick={() => {
          enlarged = true;
        }}
      >
        {#if url}
          <img src={url} alt="" draggable="false" />
          <span class="enlarge" aria-hidden="true"><ZoomIn size={18} /></span>
        {/if}
      </button>

      <dl class="fields">
        <div class="field">
          <dt class="label">{i18n.t("editor.type")}</dt>
          <dd class="value">{i18n.t(`panel.types.${item.type}`)}</dd>
        </div>

        <div class="field">
          <dt class="label">{i18n.t("editor.tags")}</dt>
          <dd class="value">
            {#if tags.length}
              <ul class="tags">
                {#each tags as tag (tag.id)}
                  <li class="tag" style:--tag-color={tag.color}>
                    <Tag size={12} aria-hidden="true" />
                    <span class="tag-name">{tag.name}</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <span class="muted">{i18n.t("details.noTags")}</span>
            {/if}
          </dd>
        </div>

        <div class="field">
          <dt class="label">{i18n.t("editor.description")}</dt>
          <dd class="value description" class:muted={!item.description}>{item.description || i18n.t("details.noDescription")}</dd>
        </div>

        <div class="field">
          <dt class="label">{i18n.t("details.file")}</dt>
          <dd class="value">
            {i18n.t("details.fileInfo", { format: item.format.toUpperCase(), width: item.width, height: item.height, size: formatBytes(item.size, locale) })}{item.animated ? ` · ${i18n.t("panel.animated")}` : ""}
          </dd>
        </div>

        <div class="field">
          <dt class="label">{i18n.t("details.added")}</dt>
          <dd class="value">{dates.format(item.createdAt)}</dd>
        </div>

        <div class="field">
          <dt class="label">{i18n.t("details.sent")}</dt>
          <dd class="value">
            {i18n.t("details.sentCount", item.usageCount)}{item.usedAt ? ` · ${i18n.t("details.lastSent", { date: dates.format(item.usedAt) })}` : ""}
          </dd>
        </div>
      </dl>
    </div>

    <footer class="modal-footer">
      <button class="button secondary" type="button" aria-pressed={item.favorite} onclick={favorite}>
        {#if item.favorite}<StarOff size={16} aria-hidden="true" />{:else}<Star size={16} aria-hidden="true" />{/if}
        {favoriteLabel}
      </button>
      <button class="button secondary" type="button" onclick={() => void saveItem(item)}>
        <Download size={16} aria-hidden="true" />
        {i18n.t("menu.download")}
      </button>
      <button class="button primary" type="button" data-primary onclick={editFromDetails}>
        <Pencil size={16} aria-hidden="true" />
        {i18n.t("menu.edit")}
      </button>
    </footer>
  </div>

  {#if enlarged && url}
    <Lightbox {url} title={item.title} width={item.width} height={item.height} onclose={closeLightbox} />
  {/if}
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background-color: var(--background-scrim, rgb(0 0 0 / 72%));
    pointer-events: auto;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: min(var(--modal-width-medium, 602px), calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: var(--radius-md, 12px);
    background-color: var(--modal-background, var(--nf-bg-elevated, #2b2d31));
    color: var(--text-default, var(--nf-text, #dbdee1));
    font-family: var(--font-primary, inherit);
    box-shadow: 0 16px 48px rgb(0 0 0 / 32%);
    transform: translate(-50%, -50%);
    pointer-events: auto;
  }

  .modal:focus {
    outline: none;
  }

  .modal :global(*) {
    box-sizing: border-box;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: var(--modal-vertical-padding, 16px) var(--modal-horizontal-padding, 24px) 8px;
  }

  .modal-title {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: 20px;
    font-weight: 600;
    line-height: 24px;
    color: var(--text-strong, var(--nf-text, #fff));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background: none;
    color: var(--interactive-icon-default, var(--nf-muted, #949ba4));
    cursor: pointer;
  }

  .close:hover {
    color: var(--interactive-icon-hover, #fff);
  }

  .modal-content {
    display: flex;
    gap: 16px;
    padding: 8px var(--modal-horizontal-padding, 24px) 16px;
    overflow-y: auto;
  }

  /* The large preview; a click shows it larger still. */
  .preview {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 160px;
    height: 160px;
    padding: 8px;
    overflow: hidden;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-base-lower, rgb(0 0 0 / 16%));
    cursor: zoom-in;
  }

  .preview:disabled {
    cursor: default;
  }

  .preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .enlarge {
    position: absolute;
    right: 6px;
    bottom: 6px;
    display: flex;
    padding: 4px;
    border-radius: var(--radius-xs, 4px);
    background-color: rgb(0 0 0 / 60%);
    color: #fff;
    opacity: 0;
    transition: opacity 0.15s ease-out;
  }

  .preview:hover .enlarge,
  .preview:focus-visible .enlarge {
    opacity: 1;
  }

  .fields {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    margin: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .label {
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
    color: var(--text-muted, var(--nf-muted, #949ba4));
    text-transform: uppercase;
  }

  .value {
    margin: 0;
    font-size: 14px;
    line-height: 18px;
    color: var(--text-default, var(--nf-text, #dbdee1));
    overflow-wrap: anywhere;
  }

  .description {
    white-space: pre-wrap;
  }

  .muted {
    color: var(--text-muted, var(--nf-muted, #949ba4));
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tag {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    height: 24px;
    padding-inline: 8px;
    border-radius: var(--radius-xs, 4px);
    background-color: var(--control-secondary-background-default, rgb(151 151 159 / 12%));
    color: var(--interactive-text-default, var(--nf-text, #dbdee1));
  }

  .tag :global(svg) {
    flex: none;
    color: var(--tag-color, currentcolor);
  }

  .tag-name {
    overflow: hidden;
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .modal-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px var(--modal-horizontal-padding, 24px);
    background-color: var(--modal-footer-background, var(--nf-bg, #313338));
  }

  .button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 40px;
    padding: 7px 15px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 8px);
    font: inherit;
    font-size: 16px;
    font-weight: 500;
    line-height: 20px;
    cursor: pointer;
    transition: background-color 0.15s ease-out, border-color 0.15s ease-out, color 0.15s ease-out;
  }

  .button :global(svg) {
    flex: none;
  }

  .secondary {
    border-color: var(--control-secondary-border-default, transparent);
    background-color: var(--control-secondary-background-default, rgb(151 151 159 / 12%));
    color: var(--control-secondary-text-default, #fff);
  }

  .secondary:hover {
    border-color: var(--control-secondary-border-hover, transparent);
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
  }

  .primary {
    border-color: var(--control-primary-border-default, transparent);
    background-color: var(--control-primary-background-default, var(--nf-accent, #5865f2));
    color: var(--control-primary-text-default, #fff);
  }

  .primary:hover {
    border-color: var(--control-primary-border-hover, transparent);
    background-color: var(--control-primary-background-hover, #4752c4);
  }

  .primary:active {
    background-color: var(--control-primary-background-active, #3c45a5);
  }

  .button:focus-visible,
  .close:focus-visible,
  .preview:focus-visible {
    outline: 2px solid var(--border-focus, var(--nf-accent, #5865f2));
    outline-offset: 2px;
  }

  /* Narrow windows stack the preview above the details. */
  @media (max-width: 480px) {
    .modal-content {
      flex-direction: column;
      align-items: center;
    }

    .fields {
      width: 100%;
    }

    .modal-header,
    .modal-content,
    .modal-footer {
      padding-inline: 16px;
    }
  }
</style>
