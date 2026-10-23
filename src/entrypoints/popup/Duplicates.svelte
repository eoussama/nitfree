<!--
  The popup's duplicates page: items that show the same picture, the same file or a resized or
  converted copy, grouped, to keep one of each group. The one kept takes the others' tags, favorite
  and sends, and the others are deleted.
-->
<script lang="ts">
  import type { TDuplicateGroup, TItem } from "~/lib/db";

  import { toError, tryCatch } from "@eoussama/core";

  import { formatBytes } from "~/lib/format";
  import { sendMessage } from "~/lib/messaging";
  import { library } from "~/lib/ui/library.svelte";
  import { thumbnail } from "~/lib/ui/thumbnails";

  import Confirm from "./Confirm.svelte";



  type TGroup = { key: string; exact: boolean; items: TItem[] };
  type TMessage = { text: string; error: boolean };

  const locale = i18n.t("locale");

  let found = $state<TDuplicateGroup[] | null>(null);
  let failed = $state<string | null>(null);
  // The item to keep in each group, by the group's key, once the user picks one.
  const keep: Record<string, string> = $state({});
  let confirming = $state<TGroup | null>(null);
  let busy = $state(false);
  let message = $state<TMessage | null>(null);

  // Groups whose items are still in the library: one deleted elsewhere drops out until the next search.
  const groups = $derived.by((): TGroup[] => {
    const byId = new Map(library.items.map(item => [item.id, item]));

    return (found ?? []).flatMap((group) => {
      const items = group.ids.flatMap(id => byId.get(id) ?? []);

      return items.length > 1 ? [{ key: group.ids.join(" "), exact: group.exact, items }] : [];
    });
  });

  // Looked for again on each change, such as an item added in a Discord tab.
  $effect(() => {
    void library.items;

    let active = true;

    void sendMessage("library:duplicates").then((next) => {
      if (active) {
        found = next;
        failed = null;
      }
    }).catch((error: unknown) => {
      if (active) {
        failed = toError(error).message;
      }
    });

    return () => {
      active = false;
    };
  });

  function kept(group: TGroup): TItem {
    return group.items.find(item => item.id === keep[group.key]) ?? group.items[0]!;
  }

  async function merge(group: TGroup): Promise<void> {
    const item = kept(group);
    const others = group.items.filter(other => other.id !== item.id);

    confirming = null;
    busy = true;
    message = null;

    const [error] = await tryCatch(sendMessage("library:merge", { keep: item.id, remove: others.map(other => other.id) }));

    busy = false;
    message = error
      ? { text: i18n.t("popup.failed", { error: toError(error).message }), error: true }
      : { text: i18n.t("popup.duplicates.merged", { title: item.title, items: i18n.t("popup.items", others.length) }), error: false };
  }
</script>

<div class="form-section">
  <p class="form-description">{i18n.t("popup.duplicates.hint")}</p>
  {#if failed && !found}
    <p class="feedback critical" role="alert">{i18n.t("popup.failed", { error: failed })}</p>
  {:else if !found}
    <p class="form-description" role="status">{i18n.t("popup.duplicates.searching")}</p>
  {:else if !groups.length}
    <p class="form-description" role="status">{i18n.t("popup.duplicates.none")}</p>
  {/if}
  {#if message}
    <p class="feedback" class:critical={message.error} class:positive={!message.error} role={message.error ? "alert" : "status"}>{message.text}</p>
  {/if}
</div>

{#each groups as group (group.key)}
  {@const selected = kept(group)}
  <div class="form-section">
    <fieldset class="options" disabled={busy}>
      <legend class="form-label">{group.exact ? i18n.t("popup.duplicates.exact", group.items.length) : i18n.t("popup.duplicates.similar", group.items.length)}</legend>
      {#each group.items as item (item.id)}
        <label class="option">
          <input
            class="radio"
            type="radio"
            name="keep-{group.key}"
            value={item.id}
            checked={item.id === selected.id}
            onchange={() => (keep[group.key] = item.id)}
          />
          <span class="preview" aria-hidden="true">
            {#await thumbnail(item) then url}
              {#if url}<img src={url} alt="" />{/if}
            {/await}
          </span>
          <span class="option-text">
            <span class="title">{item.title}</span>
            <span class="option-hint">{i18n.t("popup.duplicates.details", { width: item.width, height: item.height, size: formatBytes(item.size, locale) })}</span>
          </span>
        </label>
      {/each}
    </fieldset>
    <div class="actions">
      <button class="button primary" type="button" disabled={busy} onclick={() => (confirming = group)}>{i18n.t("popup.duplicates.keep")}</button>
    </div>
  </div>
{/each}

<Confirm
  open={confirming !== null}
  title={i18n.t("popup.duplicates.confirmTitle", { title: confirming ? kept(confirming).title : "" })}
  body={i18n.t("popup.duplicates.confirm", (confirming?.items.length ?? 1) - 1)}
  action={i18n.t("popup.duplicates.confirmMerge")}
  onconfirm={() => confirming && void merge(confirming)}
  oncancel={() => (confirming = null)}
/>

<style>
  .preview {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    overflow: hidden;
    border-radius: var(--radius-xs, 4px);
    background-color: var(--background-base-lower, rgb(0 0 0 / 16%));
  }

  .preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .option-text {
    flex: 1;
    min-width: 0;
  }

  .title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
