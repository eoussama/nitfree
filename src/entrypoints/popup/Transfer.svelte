<!--
  The popup's backup page: export the library as one .nitfree file, or import a backup or a zip or
  folder of images. An imported file is checked first, then summarized so the user chooses how to
  bring it in.
-->
<script lang="ts">
  import type { TImportMode } from "~/lib/archive";

  import { formatBytes } from "~/lib/format";
  import { library } from "~/lib/ui/library.svelte";
  import { cancelImport, exportItems, importPending, pickFolder, pickImport, transfer } from "~/lib/ui/transfer.svelte";



  const locale = i18n.t("locale");
  const MODES: TImportMode[] = ["merge", "replace"];

  let fileInput: HTMLInputElement | undefined = $state();
  let folderInput: HTMLInputElement | undefined = $state();
  let withSettings = $state(false);
  let mode: TImportMode = $state("merge");
  let importSettings = $state(true);

  const busy = $derived(transfer.busy !== null);
  const pending = $derived(transfer.pending);
  const result = $derived(transfer.result);

  const progress = $derived(
    transfer.busy === "export"
      ? i18n.t("export.progress", { done: String(transfer.done), total: String(transfer.total) })
      : transfer.busy === "import"
      ? i18n.t("popup.transfer.importing", { done: String(transfer.done), total: String(transfer.total) })
      : transfer.busy === "read" ? i18n.t("popup.transfer.reading") : "",
  );

  function onFolderPicked(): void {
    const files = [...folderInput?.files ?? []];

    if (files.length) {
      mode = "merge";
      void pickFolder(files);
    }

    if (folderInput) {
      folderInput.value = "";
    }
  }

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

{#snippet status(task: "export" | "import")}
  {#if transfer.task === task}
    {#if busy}
      <div class="status">
        <div class="progress" role="progressbar" aria-label={progress} aria-valuemin={0} aria-valuemax={transfer.total || undefined} aria-valuenow={transfer.busy === "read" ? undefined : transfer.done}>
          <div class="progress-fill" class:unknown={transfer.busy === "read"} style:width={transfer.busy === "read" ? null : `${(transfer.done / (transfer.total || 1)) * 100}%`}></div>
        </div>
        <p class="form-description" role="status">{progress}</p>
      </div>
    {:else if transfer.error}
      <p class="feedback critical" role="alert">{transfer.error}</p>
    {:else if result?.kind === "export"}
      <p class="feedback positive" role="status">{i18n.t("export.done", { items: i18n.t("popup.items", result.count) })}</p>
    {:else if result?.kind === "import"}
      <p class="feedback positive" role="status">
        {i18n.t("popup.transfer.imported", { added: String(result.added), skipped: String(result.skipped) })}
        {#if result.failed}{i18n.t("popup.transfer.failed", { failed: String(result.failed) })}{/if}
      </p>
    {/if}
  {/if}
{/snippet}

<div class="form-section">
  <h2 class="form-title">{i18n.t("popup.transfer.exportTitle")}</h2>
  <p class="form-description">{i18n.t("popup.transfer.exportHint")}</p>
  <label class="check">
    <input class="checkbox" type="checkbox" bind:checked={withSettings} disabled={busy} />
    <span>{i18n.t("popup.transfer.exportSettings")}</span>
  </label>
  <div class="actions">
    <button class="button primary" type="button" disabled={busy || !library.items.length} onclick={() => void exportItems(library.items, withSettings)}>
      {i18n.t("popup.transfer.export")}
    </button>
  </div>
  {@render status("export")}
</div>

<div class="form-section">
  <h2 class="form-title">{i18n.t("popup.transfer.start")}</h2>

  {#if pending}
    <div class="summary">
      <p class="figures">
        {i18n.t("popup.transfer.summary", {
          items: i18n.t("popup.items", pending.archive.entries.length),
          tags: i18n.t("popup.transfer.tags", pending.archive.tags.length),
          size: formatBytes(pending.archive.totalSize, locale),
        })}
      </p>
      <p class="note name">{pending.name}</p>
      {#if pending.archive.kind === "images"}
        <p class="note">{i18n.t("popup.transfer.images")}</p>
      {/if}
      {#if pending.archive.ignored}
        <p class="note">{i18n.t("popup.transfer.ignored", pending.archive.ignored)}</p>
      {/if}
    </div>

    <fieldset class="options" disabled={busy}>
      <legend class="form-label">{i18n.t("popup.transfer.mode")}</legend>
      {#each MODES as value (value)}
        <label class="option">
          <input class="radio" type="radio" name="nf-import-mode" {value} bind:group={mode} />
          <span class="option-text">
            {i18n.t(`popup.transfer.${value}`)}
            <span class="option-hint" class:warning={value === "replace"}>{i18n.t(`popup.transfer.${value}Hint`)}</span>
          </span>
        </label>
      {/each}
    </fieldset>

    {#if pending.archive.settings}
      <label class="check settings">
        <input class="checkbox" type="checkbox" bind:checked={importSettings} disabled={busy} />
        <span>{i18n.t("popup.transfer.withSettings")}</span>
      </label>
    {/if}

    <div class="actions">
      <button class="button secondary" type="button" disabled={busy} onclick={cancelImport}>{i18n.t("editor.cancel")}</button>
      <button class="button" class:primary={mode === "merge"} class:critical={mode === "replace"} type="button" disabled={busy} onclick={() => void importPending(mode, importSettings)}>
        {i18n.t("popup.transfer.start")}
      </button>
    </div>
  {:else}
    <p class="form-description">{i18n.t("popup.transfer.importHint")}</p>
    <div class="actions">
      <button class="button secondary" type="button" disabled={busy} onclick={() => folderInput?.click()}>{i18n.t("popup.transfer.importFolder")}</button>
      <button class="button primary" type="button" disabled={busy} onclick={() => fileInput?.click()}>{i18n.t("popup.transfer.import")}</button>
      <input bind:this={folderInput} class="file-input" type="file" webkitdirectory tabindex="-1" aria-hidden="true" onchange={onFolderPicked} />
      <input bind:this={fileInput} class="file-input" type="file" accept=".nitfree,.zip,application/zip" tabindex="-1" aria-hidden="true" onchange={onPicked} />
    </div>
  {/if}
  {@render status("import")}
</div>

<style>
  .summary {
    margin-bottom: 16px;
    padding: 12px 16px;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--nf-bg-elevated);
  }

  .figures {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
    line-height: 20px;
  }

  .note {
    margin: 0;
    color: var(--nf-muted);
    font-size: 14px;
    line-height: 18px;
  }

  .name {
    overflow-wrap: anywhere;
  }

  .option-hint.warning {
    color: var(--text-feedback-critical, var(--nf-critical-text));
  }

  .settings {
    margin-top: 12px;
  }

  .status {
    margin-top: 12px;
  }

  .status .progress {
    margin-bottom: 8px;
  }

  .file-input {
    display: none;
  }
</style>
