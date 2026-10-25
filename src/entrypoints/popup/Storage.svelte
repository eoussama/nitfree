<!--
  The popup's storage page: how much space the library takes, by type and in cached copies, against
  what the browser allows; the largest items, to pick some and delete them; and asking the browser
  to keep the library when the disk runs low.
-->
<script lang="ts">
  import type { TCacheUsage } from "~/lib/db";

  import { toError, tryCatch } from "@eoussama/core";

  import { ITEM_TYPES } from "~/lib/db/types";
  import { formatBytes } from "~/lib/format";
  import { sendMessage } from "~/lib/messaging";
  import { library } from "~/lib/ui/library.svelte";
  import { thumbnail } from "~/lib/ui/thumbnails";

  import Confirm from "./Confirm.svelte";



  type TSection = "cache" | "largest" | "persist";
  type TMessage = { section: TSection; text: string; error: boolean };

  /**
   * How many of the largest items are listed.
   */
  const LARGEST = 8;

  const locale = i18n.t("locale");
  const canPersist = typeof navigator.storage?.persist === "function";

  let estimate = $state<StorageEstimate | null>(null);
  let cache = $state<TCacheUsage | null>(null);
  let persisted = $state<boolean | null>(null);
  let selected: string[] = $state([]);
  let confirming = $state(false);
  let busy = $state(false);
  let message = $state<TMessage | null>(null);
  // Bumped to measure again after a change the library does not announce, such as clearing the cache.
  let measured = $state(0);

  const sizes = $derived(ITEM_TYPES.map(type => ({
    type,
    size: library.items.reduce((sum, item) => sum + (item.type === type ? item.size : 0), 0),
  })));

  const largest = $derived([...library.items].sort((a, b) => b.size - a.size).slice(0, LARGEST));
  // Items deleted elsewhere drop out of the selection.
  const chosen = $derived(selected.filter(id => largest.some(item => item.id === id)));

  const used = $derived(estimate?.usage === undefined ? null : size(estimate.usage));
  const quota = $derived(estimate?.quota === undefined ? null : size(estimate.quota));

  // What the extension's storage holds, read again on each change.
  $effect(() => {
    void library.items;
    void measured;

    let active = true;

    void Promise.all([
      navigator.storage?.estimate().catch(() => null),
      sendMessage("library:cacheUsage").catch(() => null),
    ]).then(([nextEstimate, nextCache]) => {
      if (active) {
        estimate = nextEstimate ?? null;
        cache = nextCache;
      }
    });

    return () => {
      active = false;
    };
  });

  $effect(() => {
    void navigator.storage?.persisted?.().then((value) => {
      persisted = value;
    }).catch(() => undefined);
  });

  function size(bytes: number): string {
    return formatBytes(bytes, locale);
  }

  async function run(section: TSection, task: () => Promise<string>): Promise<void> {
    busy = true;
    message = null;

    const [error, text] = await tryCatch(task);

    busy = false;
    measured++;
    message = error
      ? { section, text: i18n.t("popup.failed", { error: toError(error).message }), error: true }
      : { section, text, error: false };
  }

  function clearCache(): Promise<void> {
    return run("cache", async () => {
      const freed = await sendMessage("library:clearCache");

      return i18n.t("popup.storage.cleared", { size: size(freed.size) });
    });
  }

  function deleteChosen(): Promise<void> {
    const ids = $state.snapshot(chosen);

    confirming = false;

    return run("largest", async () => {
      const removed = await sendMessage("library:removeMany", { ids });

      selected = selected.filter(id => !removed.includes(id));

      return i18n.t("popup.storage.deleted", { items: i18n.t("popup.items", removed.length) });
    });
  }

  async function protect(): Promise<void> {
    message = null;

    const [, granted] = await tryCatch(() => navigator.storage.persist());

    persisted = granted ?? false;

    if (!persisted) {
      message = { section: "persist", text: i18n.t("popup.storage.persistDenied"), error: true };
    }
  }
</script>

{#snippet feedback(section: TSection)}
  {#if message?.section === section}
    <p class="feedback" class:critical={message.error} class:positive={!message.error} role={message.error ? "alert" : "status"}>{message.text}</p>
  {/if}
{/snippet}

<div class="form-section">
  <h2 class="form-title">{i18n.t("popup.storage.usage")}</h2>
  {#if used}
    <p class="form-description">{quota ? i18n.t("popup.storage.usedOf", { used, quota }) : i18n.t("popup.storage.used", { used })}</p>
  {/if}
  <dl class="rows">
    {#each sizes as { type, size: bytes } (type)}
      <div class="row">
        <dt>{i18n.t(`panel.types.${type}`)}</dt>
        <dd data-type={type}>{library.loaded ? size(bytes) : ""}</dd>
      </div>
    {/each}
    <div class="row">
      <dt>{i18n.t("popup.storage.cached")}</dt>
      <dd data-type="cache">{cache ? size(cache.size) : ""}</dd>
    </div>
  </dl>
</div>

<div class="form-section">
  <h2 class="form-title">{i18n.t("popup.storage.cached")}</h2>
  <p class="form-description">{i18n.t("popup.storage.cachedHint")}</p>
  <div class="actions">
    <button class="button secondary" type="button" disabled={busy || !cache?.count} onclick={() => void clearCache()}>
      {i18n.t("popup.storage.clearCache")}
    </button>
  </div>
  {@render feedback("cache")}
</div>

{#if largest.length}
  <div class="form-section">
    <h2 id="nf-largest" class="form-title">{i18n.t("popup.storage.largest")}</h2>
    <p class="form-description">{i18n.t("popup.storage.largestHint")}</p>
    <ul class="largest" aria-labelledby="nf-largest">
      {#each largest as item (item.id)}
        <li>
          <label class="item">
            <input class="checkbox" type="checkbox" value={item.id} bind:group={selected} disabled={busy} />
            <span class="preview" aria-hidden="true">
              {#await thumbnail(item) then url}
                {#if url}<img src={url} alt="" />{/if}
              {/await}
            </span>
            <span class="name">
              <span class="title">{item.title}</span>
              <span class="type">{i18n.t(`panel.types.${item.type}`)}</span>
            </span>
            <span class="size">{size(item.size)}</span>
          </label>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <button class="button critical" type="button" disabled={busy || !chosen.length} onclick={() => (confirming = true)}>
        {i18n.t("popup.storage.delete", chosen.length)}
      </button>
    </div>
    {@render feedback("largest")}
  </div>
{/if}

{#if canPersist && persisted !== null}
  <div class="form-section">
    <h2 class="form-title">{i18n.t("popup.storage.persistTitle")}</h2>
    {#if persisted}
      <p class="form-description">{i18n.t("popup.storage.persisted")}</p>
    {:else}
      <p class="form-description">{i18n.t("popup.storage.persistHint")}</p>
      <div class="actions">
        <button class="button primary" type="button" onclick={() => void protect()}>{i18n.t("popup.storage.persist")}</button>
      </div>
    {/if}
    {@render feedback("persist")}
  </div>
{/if}

<Confirm
  open={confirming && chosen.length > 0}
  title={i18n.t("popup.storage.delete", chosen.length)}
  body={i18n.t("popup.storage.confirm")}
  action={i18n.t("menu.delete")}
  onconfirm={() => void deleteChosen()}
  oncancel={() => (confirming = false)}
/>

<style>
  .largest {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-radius: var(--radius-sm, 8px);
    cursor: pointer;
  }

  .item:hover {
    background-color: var(--background-mod-subtle, var(--nf-mod-subtle));
  }

  .preview {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    overflow: hidden;
    border-radius: var(--radius-xs, 4px);
    background-color: var(--background-base-lower, rgb(0 0 0 / 16%));
  }

  .preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .name {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .title {
    overflow: hidden;
    color: var(--text-default, var(--nf-text));
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .type,
  .size {
    color: var(--text-muted, var(--nf-muted));
    font-size: 12px;
    line-height: 16px;
  }

  .size {
    flex: none;
  }
</style>
