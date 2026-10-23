<!--
  The popup's packs page: named groups of items, each a section of the panel. Make a pack, then pick one
  to rename, delete or export it as a .nitfree file of its own, which imports on another browser with
  the same items and name, or to choose which of its items is its icon in the panel's sidebar. Items join
  packs from their edit dialog.
-->
<script lang="ts">
  import type { TItem, TPack } from "~/lib/db";

  import { toError, tryCatch } from "@eoussama/core";

  import { ARCHIVE_EXTENSION } from "~/lib/archive";
  import { sendMessage } from "~/lib/messaging";
  import { download, safeFileName } from "~/lib/ui/download";
  import { buildExport } from "~/lib/ui/export";
  import { library } from "~/lib/ui/library.svelte";
  import { archiveProblem } from "~/lib/ui/problems";
  import { packIcon } from "~/lib/ui/sections";
  import { still } from "~/lib/ui/thumbnails";
  import { tooltip } from "~/lib/ui/tooltip.svelte";

  import Confirm from "./Confirm.svelte";



  type TSection = "create" | "packs" | "icon";
  type TMessage = { section: TSection; text: string; error: boolean };

  let name = $state("");
  let chosenId = $state<string | null>(null);
  let renaming = $state(false);
  let renamed = $state("");
  let confirming = $state(false);
  let busy = $state(false);
  let message = $state<TMessage | null>(null);

  // The pack picked, or the first one until the user picks; one deleted elsewhere falls back the same way.
  const chosen = $derived(library.packs.find(pack => pack.id === chosenId) ?? library.packs[0] ?? null);

  function itemsOf(pack: TPack) {
    return library.items.filter(item => item.packs.includes(pack.id));
  }

  // One change at a time; its outcome shows under the section it came from.
  async function run<T>(section: TSection, task: () => Promise<T>, done: (result: T) => string): Promise<T | null> {
    busy = true;
    message = null;

    const [error, result] = await tryCatch(task());

    busy = false;
    message = error
      ? { section, text: i18n.t("popup.failed", { error: toError(error).message }), error: true }
      : { section, text: done(result), error: false };

    return error ? null : result;
  }

  async function create(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const pack = await run("create", () => sendMessage("packs:add", { name }), created => i18n.t("popup.packs.created", { name: created.name }));

    if (pack) {
      name = "";
      chosenId = pack.id;
    }
  }

  function startRename(): void {
    renamed = chosen?.name ?? "";
    renaming = true;
    message = null;
  }

  async function rename(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const pack = chosen;

    if (pack && await run("packs", () => sendMessage("packs:update", { id: pack.id, patch: { name: renamed } }), updated => i18n.t("popup.packs.renamed", { name: updated.name }))) {
      renaming = false;
    }
  }

  async function remove(pack: TPack): Promise<void> {
    confirming = false;
    await run("packs", () => sendMessage("packs:remove", { id: pack.id }), () => i18n.t("popup.packs.deleted", { name: pack.name }));
  }

  // Saved at once, as the settings are; only a failure is said.
  async function setIcon(pack: TPack, item: TItem): Promise<void> {
    const [error] = await tryCatch(sendMessage("packs:update", { id: pack.id, patch: { icon: item.id } }));

    message = error ? { section: "icon", text: i18n.t("popup.failed", { error: toError(error).message }), error: true } : null;
  }

  // The pack's items go into an archive of their own, with only that pack, saved under its name.
  async function exportPack(pack: TPack): Promise<void> {
    const items = itemsOf(pack);

    busy = true;
    message = null;

    const [error, archive] = await tryCatch(buildExport(items, { packs: [pack] }));

    busy = false;

    if (error) {
      message = { section: "packs", text: i18n.t("export.failed", { error: archiveProblem(error) }), error: true };

      return;
    }

    download(archive, `${safeFileName(pack.name)}${ARCHIVE_EXTENSION}`);
    message = { section: "packs", text: i18n.t("export.done", { items: i18n.t("popup.items", items.length) }), error: false };
  }
</script>

{#snippet feedback(section: TSection)}
  {#if message?.section === section}
    <p class="feedback" class:critical={message.error} class:positive={!message.error} role={message.error ? "alert" : "status"}>{message.text}</p>
  {/if}
{/snippet}

<form class="form-section" onsubmit={create}>
  <h2 class="form-title">{i18n.t("popup.packs.new")}</h2>
  <p class="form-description">{i18n.t("popup.packs.hint")}</p>
  <label>
    <span class="form-label">{i18n.t("editor.title")}</span>
    <input class="input" type="text" autocomplete="off" disabled={busy} bind:value={name} />
  </label>
  <div class="actions">
    <button class="button primary" type="submit" disabled={busy || !name.trim()}>{i18n.t("popup.packs.create")}</button>
  </div>
  {@render feedback("create")}
</form>

<div class="form-section">
  <h2 id="nf-packs" class="form-title">{i18n.t("popup.packs.list")}</h2>
  {#if chosen}
    <p class="form-description">{i18n.t("popup.packs.listHint")}</p>
    <fieldset class="options" aria-labelledby="nf-packs" disabled={busy || renaming}>
      {#each library.packs as pack (pack.id)}
        <label class="option">
          <input class="radio" type="radio" name="nf-pack" value={pack.id} checked={pack.id === chosen.id} onchange={() => (chosenId = pack.id)} />
          <span class="option-text">
            <span class="name">{pack.name}</span>
            <span class="option-hint">{i18n.t("popup.items", itemsOf(pack).length)}</span>
          </span>
        </label>
      {/each}
    </fieldset>

    {#if renaming}
      <form class="rename" onsubmit={rename}>
        <label>
          <span class="form-label">{i18n.t("editor.title")}</span>
          <input class="input" type="text" autocomplete="off" disabled={busy} bind:value={renamed} {@attach node => node.focus()} />
        </label>
        <div class="actions">
          <button class="button secondary" type="button" disabled={busy} onclick={() => (renaming = false)}>{i18n.t("editor.cancel")}</button>
          <button class="button primary" type="submit" disabled={busy || !renamed.trim()}>{i18n.t("editor.save")}</button>
        </div>
      </form>
    {:else}
      <div class="actions">
        <button class="button critical" type="button" disabled={busy} onclick={() => (confirming = true)}>{i18n.t("menu.delete")}</button>
        <button class="button secondary" type="button" disabled={busy} onclick={startRename}>{i18n.t("popup.packs.rename")}</button>
        <button class="button primary" type="button" disabled={busy || !itemsOf(chosen).length} onclick={() => void exportPack(chosen)}>{i18n.t("popup.transfer.exportTitle")}</button>
      </div>
    {/if}
  {:else}
    <p class="form-description" role="status">{i18n.t("popup.packs.none")}</p>
  {/if}
  {@render feedback("packs")}
</div>

{#if chosen && itemsOf(chosen).length}
  {@const icon = packIcon(chosen, library.items)}
  <div class="form-section">
    <h2 id="nf-pack-icon" class="form-title">{i18n.t("popup.packs.icon")}</h2>
    <p class="form-description">{i18n.t("popup.packs.iconHint")}</p>
    <div class="icons" role="radiogroup" aria-labelledby="nf-pack-icon">
      {#each itemsOf(chosen) as item (item.id)}
        <label class="icon" {@attach tooltip(item.title)}>
          <input
            type="radio"
            name="nf-pack-icon"
            value={item.id}
            checked={item.id === icon?.id}
            disabled={busy}
            aria-label={item.title}
            onchange={() => void setIcon(chosen, item)}
          />
          {#await still(item) then url}
            {#if url}<img src={url} alt="" draggable="false" />{/if}
          {/await}
        </label>
      {/each}
    </div>
    {@render feedback("icon")}
  </div>
{/if}

<Confirm
  open={confirming && chosen !== null}
  title={i18n.t("popup.packs.confirmTitle", { name: chosen?.name ?? "" })}
  body={i18n.t("popup.packs.confirm")}
  action={i18n.t("popup.packs.confirmDelete")}
  onconfirm={() => chosen && void remove(chosen)}
  oncancel={() => (confirming = false)}
/>

<style>
  .rename {
    margin-top: 16px;
  }

  /* A long name wraps rather than widening the popup. */
  .option-text {
    min-width: 0;
  }

  .name {
    overflow-wrap: anywhere;
  }

  /* The pack's items as Discord's emoji grid, the chosen one ringed; many scroll within three rows. */
  .icons {
    display: grid;
    grid-template-columns: repeat(auto-fill, 40px);
    gap: 8px;
    max-height: 136px;
    padding: 2px;
    overflow-y: auto;
  }

  .icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-mod-subtle, var(--nf-mod-subtle));
    cursor: pointer;
  }

  .icon:hover {
    background-color: var(--background-mod-normal, var(--nf-mod-normal));
  }

  .icon:has(:checked) {
    outline: 2px solid var(--control-brand-foreground-new, var(--nf-accent));
    outline-offset: -2px;
  }

  .icon:has(:focus-visible) {
    outline: 2px solid var(--border-focus, var(--nf-accent));
    outline-offset: 2px;
  }

  .icon:has(:disabled) {
    cursor: not-allowed;
  }

  /* The real radio stays for keyboards and screen readers; the picture is what shows. */
  .icon input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  .icon img {
    max-width: 32px;
    max-height: 32px;
    object-fit: contain;
    pointer-events: none;
  }
</style>
