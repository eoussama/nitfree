<!--
  The popup's storage section: how much space the library takes, by type and in cached copies,
  against what the browser allows; the largest items, to pick some and delete them; and asking
  the browser to keep the library when the disk runs low.
-->
<script lang="ts">
  import type { TCacheUsage, TItem } from "~/lib/db";

  import { toError, tryCatch } from "@eoussama/core";

  import { ITEM_TYPES } from "~/lib/db/types";
  import { formatBytes } from "~/lib/format";
  import { sendMessage } from "~/lib/messaging";
  import { library } from "~/lib/ui/library.svelte";
  import { thumbnail } from "~/lib/ui/thumbnails";



  type TMessage = { text: string; error: boolean };

  /**
   * How many of the largest items are listed.
   */
  const LARGEST = 8;

  const locale = i18n.t("locale");
  const canPersist = typeof navigator.storage?.persist === "function";

  let estimate = $state<StorageEstimate | null>(null);
  let cache: TCacheUsage | null = $state(null);
  let persisted: boolean | null = $state(null);
  let selected: string[] = $state([]);
  let confirming = $state(false);
  let busy = $state(false);
  let message: TMessage | null = $state(null);
  // Bumped to measure again after a change the library does not announce, such as clearing the cache.
  let measured = $state(0);

  const sizes = $derived(ITEM_TYPES.map(type => ({
    type,
    size: library.items.reduce((sum, item) => sum + (item.type === type ? item.size : 0), 0),
  })));

  const largest = $derived([...library.items].sort((a, b) => b.size - a.size).slice(0, LARGEST));
  // Items deleted elsewhere drop out of the selection.
  const chosen = $derived(selected.filter(id => largest.some(item => item.id === id)));

  const used = $derived(estimate?.usage === undefined ? null : formatBytes(estimate.usage, locale));
  const quota = $derived(estimate?.quota === undefined ? null : formatBytes(estimate.quota, locale));

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

  async function run(task: () => Promise<string>): Promise<void> {
    busy = true;
    message = null;

    const [error, text] = await tryCatch(task);

    busy = false;
    measured++;
    message = error ? { text: i18n.t("popup.storage.failed", { error: toError(error).message }), error: true } : { text, error: false };
  }

  function clearCache(): Promise<void> {
    return run(async () => {
      const freed = await sendMessage("library:clearCache");

      return i18n.t("popup.storage.cleared", { size: size(freed.size) });
    });
  }

  function deleteChosen(): Promise<void> {
    const ids = $state.snapshot(chosen);

    confirming = false;

    return run(async () => {
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
      message = { text: i18n.t("popup.storage.persistDenied"), error: true };
    }
  }

  function typeOf(item: TItem): string {
    return i18n.t(`panel.types.${item.type}`);
  }
</script>

<section class="popup-section" aria-labelledby="nf-storage">
  <h2 id="nf-storage" class="popup-heading">{i18n.t("popup.storage.heading")}</h2>

  {#if used}
    <p class="total">
      {quota ? i18n.t("popup.storage.usedOf", { used, quota }) : i18n.t("popup.storage.used", { used })}
    </p>
  {/if}

  <dl class="breakdown">
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

  <div class="actions">
    <button class="button secondary" type="button" disabled={busy || !cache?.count} onclick={() => void clearCache()}>
      {i18n.t("popup.storage.clearCache")}
    </button>
  </div>
  <p class="hint">{i18n.t("popup.storage.cachedHint")}</p>

  {#if largest.length}
    <h3 id="nf-largest" class="subheading">{i18n.t("popup.storage.largest")}</h3>
    <ul class="largest" aria-labelledby="nf-largest">
      {#each largest as item (item.id)}
        <li>
          <label class="item">
            <input type="checkbox" value={item.id} bind:group={selected} disabled={busy} />
            <span class="preview" aria-hidden="true">
              {#await thumbnail(item) then url}
                {#if url}<img src={url} alt="" />{/if}
              {/await}
            </span>
            <span class="name">
              <span class="title">{item.title}</span>
              <span class="hint">{typeOf(item)}</span>
            </span>
            <span class="size">{size(item.size)}</span>
          </label>
        </li>
      {/each}
    </ul>

    {#if confirming && chosen.length}
      <div class="confirm" role="group" aria-labelledby="nf-confirm">
        <p id="nf-confirm" class="confirm-text">{i18n.t("popup.storage.confirm", { items: i18n.t("popup.items", chosen.length) })}</p>
        <div class="actions">
          <button class="button danger" type="button" disabled={busy} onclick={() => void deleteChosen()}>{i18n.t("popup.storage.confirmDelete")}</button>
          <button class="button secondary" type="button" onclick={() => (confirming = false)}>{i18n.t("popup.storage.cancel")}</button>
        </div>
      </div>
    {:else}
      <div class="actions">
        <button class="button danger" type="button" disabled={busy || !chosen.length} onclick={() => (confirming = true)}>
          {i18n.t("popup.storage.delete", chosen.length)}
        </button>
      </div>
    {/if}
  {/if}

  {#if persisted}
    <p class="hint">{i18n.t("popup.storage.persisted")}</p>
  {:else if canPersist && persisted === false}
    <div class="actions">
      <button class="button secondary" type="button" onclick={() => void protect()}>{i18n.t("popup.storage.persist")}</button>
    </div>
    <p class="hint">{i18n.t("popup.storage.persistHint")}</p>
  {/if}

  {#if message}
    <p class="message" class:error={message.error} role={message.error ? "alert" : "status"}>{message.text}</p>
  {/if}
</section>

<style>
  .total {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
    line-height: 18px;
  }

  .breakdown {
    margin: 0 0 12px;
    padding: 4px 12px;
    border-radius: var(--nf-radius, 8px);
    background-color: var(--nf-bg-elevated);
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0;
    font-size: 14px;
    line-height: 18px;
  }

  .row dt {
    color: var(--nf-muted);
  }

  .row dd {
    margin: 0;
    font-weight: 500;
  }

  .subheading {
    margin: 16px 0 8px;
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
  }

  .largest {
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    border-radius: 4px;
    cursor: pointer;
  }

  .item:hover {
    background-color: rgb(151 151 159 / 8%);
  }

  .item input {
    flex: none;
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--nf-accent);
  }

  .preview {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    overflow: hidden;
    border-radius: 4px;
    background-color: var(--nf-bg-elevated);
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
    font-size: 14px;
    line-height: 18px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .size {
    flex: none;
    color: var(--nf-muted);
    font-size: 12px;
    line-height: 16px;
  }

  .confirm {
    margin-bottom: 12px;
    padding: 12px;
    border-radius: var(--nf-radius, 8px);
    background-color: var(--nf-bg-elevated);
  }

  .confirm .actions {
    margin-bottom: 0;
  }

  .confirm-text {
    margin: 0 0 8px;
    font-size: 14px;
    line-height: 18px;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  /* Discord's secondary and danger buttons. */
  .button {
    height: 32px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .button.secondary {
    background-color: rgb(151 151 159 / 16%);
    color: var(--nf-text);
  }

  .button.danger {
    background-color: var(--nf-danger, #f23f42);
    color: #fff;
  }

  .button:hover:not(:disabled) {
    filter: brightness(0.9);
  }

  .button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .button:focus-visible,
  .item input:focus-visible {
    outline: 2px solid var(--nf-accent);
    outline-offset: 2px;
  }

  .hint {
    margin: 0 0 4px;
    color: var(--nf-muted);
    font-size: 12px;
    line-height: 16px;
  }

  .name .hint {
    margin: 0;
  }

  .message {
    margin: 12px 0 0;
    font-size: 13px;
    line-height: 18px;
  }

  .message.error {
    color: var(--nf-danger, #f23f42);
  }
</style>
