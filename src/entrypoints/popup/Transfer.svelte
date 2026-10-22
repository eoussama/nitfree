<!--
  The popup's backup section: export the library as one .nitfree file, or import a backup or a zip
  of images. An imported file is checked first, then summarized so the user chooses how to bring it in.
-->
<script lang="ts">
  import type { TImportMode } from "~/lib/ui/transfer.svelte";

  import { formatBytes } from "~/lib/format";
  import { library } from "~/lib/ui/library.svelte";
  import { cancelImport, exportItems, importPending, pickImport, transfer } from "~/lib/ui/transfer.svelte";



  const locale = i18n.t("locale");
  const MODES: TImportMode[] = ["merge", "replace"];

  let fileInput: HTMLInputElement | undefined = $state();
  let withSettings = $state(false);
  let mode: TImportMode = $state("merge");
  let importSettings = $state(true);

  const busy = $derived(transfer.busy !== null);
  const pending = $derived(transfer.pending);
  const result = $derived(transfer.result);

  const progress = $derived(
    transfer.busy === "export"
      ? i18n.t("popup.transfer.exporting", { done: String(transfer.done), total: String(transfer.total) })
      : transfer.busy === "import"
      ? i18n.t("popup.transfer.importing", { done: String(transfer.done), total: String(transfer.total) })
      : transfer.busy === "read" ? i18n.t("popup.transfer.reading") : "",
  );

  function onPicked(): void {
    const file = fileInput?.files?.[0];

    if (file) {
      mode = "merge";
      void pickImport(file);
    }

    if (fileInput) {
      fileInput.value = "";
    }
  }
</script>

<section class="popup-section" aria-labelledby="nf-transfer">
  <h2 id="nf-transfer" class="popup-heading">{i18n.t("popup.transfer.heading")}</h2>

  {#if pending}
    <div class="summary">
      <p class="figures">
        {i18n.t("popup.transfer.summary", {
          items: i18n.t("popup.items", pending.archive.entries.length),
          tags: i18n.t("popup.transfer.tags", pending.archive.tags.length),
          size: formatBytes(pending.archive.totalSize, locale),
        })}
      </p>
      <p class="hint name">{pending.name}</p>
      {#if pending.archive.kind === "images"}
        <p class="hint">{i18n.t("popup.transfer.images")}</p>
      {/if}
      {#if pending.archive.ignored}
        <p class="hint">{i18n.t("popup.transfer.ignored", pending.archive.ignored)}</p>
      {/if}
    </div>

    <fieldset class="group" disabled={busy}>
      <legend class="legend">{i18n.t("popup.transfer.mode")}</legend>
      {#each MODES as value (value)}
        <label class="choice">
          <input type="radio" name="nf-import-mode" {value} bind:group={mode} />
          <span>
            {i18n.t(`popup.transfer.${value}`)}
            <span class="hint block" class:warning={value === "replace"}>{i18n.t(`popup.transfer.${value}Hint`)}</span>
          </span>
        </label>
      {/each}
    </fieldset>

    {#if pending.archive.settings}
      <label class="check">
        <input type="checkbox" bind:checked={importSettings} disabled={busy} />
        <span>{i18n.t("popup.transfer.withSettings")}</span>
      </label>
    {/if}

    <div class="actions">
      <button class="button" type="button" disabled={busy} onclick={() => void importPending(mode, importSettings)}>{i18n.t("popup.transfer.start")}</button>
      <button class="button secondary" type="button" disabled={busy} onclick={cancelImport}>{i18n.t("popup.transfer.cancel")}</button>
    </div>
  {:else}
    <div class="actions">
      <button class="button" type="button" disabled={busy || !library.items.length} onclick={() => void exportItems(library.items, withSettings)}>
        {i18n.t("popup.transfer.export")}
      </button>
      <button class="button secondary" type="button" disabled={busy} onclick={() => fileInput?.click()}>{i18n.t("popup.transfer.import")}</button>
      <input bind:this={fileInput} class="file-input" type="file" accept=".nitfree,.zip,application/zip" tabindex="-1" aria-hidden="true" onchange={onPicked} />
    </div>
    <label class="check">
      <input type="checkbox" bind:checked={withSettings} disabled={busy} />
      <span>{i18n.t("popup.transfer.exportSettings")}</span>
    </label>
    <p class="hint">{i18n.t("popup.transfer.exportHint")}</p>
    <p class="hint">{i18n.t("popup.transfer.importHint")}</p>
  {/if}

  {#if busy}
    <div class="status">
      <progress class="bar" max={transfer.total || undefined} value={transfer.busy === "read" ? undefined : transfer.done} aria-label={progress}></progress>
      <p class="hint" role="status">{progress}</p>
    </div>
  {:else if transfer.error}
    <p class="message error" role="alert">{transfer.error}</p>
  {:else if result?.kind === "export"}
    <p class="message" role="status">{i18n.t("popup.transfer.exported", { items: i18n.t("popup.items", result.count) })}</p>
  {:else if result?.kind === "import"}
    <p class="message" role="status">
      {i18n.t("popup.transfer.imported", { added: String(result.added), skipped: String(result.skipped) })}
      {#if result.failed}{i18n.t("popup.transfer.failed", { failed: String(result.failed) })}{/if}
    </p>
  {/if}
</section>

<style>
  .actions {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  /* Discord's primary and secondary buttons. */
  .button {
    height: 32px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background-color: var(--nf-accent);
    color: #fff;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .button.secondary {
    background-color: rgb(151 151 159 / 16%);
    color: var(--nf-text);
  }

  .button:hover:not(:disabled) {
    filter: brightness(0.9);
  }

  .button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .button:focus-visible,
  .check input:focus-visible,
  .choice input:focus-visible {
    outline: 2px solid var(--nf-accent);
    outline-offset: 2px;
  }

  .hint {
    margin: 0 0 4px;
    color: var(--nf-muted);
    font-size: 12px;
    line-height: 16px;
  }

  .hint.block {
    display: block;
    margin: 0;
  }

  .hint.warning {
    color: var(--nf-danger, #f23f42);
  }

  .check,
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 14px;
    line-height: 18px;
    cursor: pointer;
  }

  .check input,
  .choice input {
    flex: none;
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--nf-accent);
  }

  .summary {
    margin-bottom: 12px;
    padding: 12px;
    border-radius: var(--nf-radius, 8px);
    background-color: var(--nf-bg-elevated);
  }

  .figures {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 600;
    line-height: 18px;
  }

  .name {
    overflow-wrap: anywhere;
  }

  .group {
    min-width: 0;
    margin: 0 0 12px;
    padding: 0;
    border: none;
  }

  .legend {
    margin-bottom: 8px;
    padding: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
  }

  .status {
    margin-top: 12px;
  }

  .bar {
    width: 100%;
    height: 6px;
    margin-bottom: 4px;
    accent-color: var(--nf-accent);
  }

  .message {
    margin: 12px 0 0;
    font-size: 13px;
    line-height: 18px;
  }

  .message.error {
    color: var(--nf-danger, #f23f42);
  }

  .file-input {
    display: none;
  }
</style>
