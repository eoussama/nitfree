<!--
  The extension popup: the library at a glance, live as it changes in Discord tabs, a place to add
  files through the same dialog as in Discord, and the settings. Styled with the last palette seen on
  Discord, or the OS light or dark one before any.
-->
<script lang="ts">
  import logo from "~/assets/logo.png";
  import { ITEM_TYPES } from "~/lib/db/types";
  import { formatBytes } from "~/lib/format";
  import { followStoredTheme } from "~/lib/theme";
  import { ACCEPTED_FILES } from "~/lib/ui/drafts";
  import { editor, startAdd } from "~/lib/ui/editor.svelte";
  import { followLibrary, library } from "~/lib/ui/library.svelte";

  import Settings from "./Settings.svelte";



  const { version } = browser.runtime.getManifest();
  const locale = i18n.t("locale");

  let fileInput: HTMLInputElement | undefined = $state();
  let dragging = $state(false);
  let usage: number | null = $state(null);

  const counts = $derived(ITEM_TYPES.map(type => ({ type, count: library.items.filter(item => item.type === type).length })));

  document.documentElement.lang = locale;

  $effect(() => followStoredTheme(document.documentElement));
  $effect(() => followLibrary());

  // What the extension's storage holds, the library's files and their sized copies, read again on each change.
  $effect(() => {
    void library.items;

    let active = true;

    void navigator.storage?.estimate().then(({ usage: used }) => {
      if (active) {
        usage = used ?? null;
      }
    });

    return () => {
      active = false;
    };
  });

  function hasFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes("Files") ?? false;
  }

  function onDragOver(event: DragEvent): void {
    if (hasFiles(event) && !editor.mode) {
      event.preventDefault();
      dragging = true;
    }
  }

  function onDragLeave(event: DragEvent): void {
    if (!(event.currentTarget as Element).contains(event.relatedTarget as Node | null)) {
      dragging = false;
    }
  }

  function onDrop(event: DragEvent): void {
    dragging = false;

    if (hasFiles(event) && !editor.mode) {
      event.preventDefault();
      void startAdd(event.dataTransfer?.files ?? []);
    }
  }

  // Pasted images are added; text pasted into a settings field stays there.
  function onPaste(event: ClipboardEvent): void {
    const files = [...event.clipboardData?.files ?? []];

    if (files.length && !editor.mode) {
      event.preventDefault();
      void startAdd(files);
    }
  }

  function onPicked(): void {
    void startAdd(fileInput?.files ?? []);

    if (fileInput) {
      fileInput.value = "";
    }
  }
</script>

<svelte:window onpaste={onPaste} />

<main class="popup" class:editing={editor.mode !== null} ondragenter={onDragOver} ondragover={onDragOver} ondragleave={onDragLeave} ondrop={onDrop}>
  <header class="header">
    <img src={logo} alt={i18n.t("popup.logo")} width="40" height="40" />
    <div>
      <h1 class="title">{i18n.t("extName")}</h1>
      <p class="version">{i18n.t("popup.version", { version })}</p>
    </div>
  </header>

  <section class="popup-section" aria-labelledby="nf-library">
    <h2 id="nf-library" class="popup-heading">{i18n.t("popup.library")}</h2>

    {#if library.error}
      <p class="hint">{i18n.t("panel.error")}</p>
    {:else}
      <p class="total" aria-busy={!library.loaded}>
        {#if library.loaded}{i18n.t("popup.items", library.items.length)}{/if}
      </p>
      <dl class="counts">
        {#each counts as { type, count } (type)}
          <div class="count">
            <dt>{i18n.t(`panel.types.${type}`)}</dt>
            <dd data-type={type}>{library.loaded ? count : ""}</dd>
          </div>
        {/each}
      </dl>
      {#if usage !== null}
        <p class="hint">{i18n.t("popup.storage", { size: formatBytes(usage, locale) })}</p>
      {/if}
    {/if}
  </section>

  <section class="popup-section" aria-labelledby="nf-add">
    <h2 id="nf-add" class="popup-heading">{i18n.t("popup.add")}</h2>
    <div class="drop" class:dragging>
      <p class="hint">{i18n.t("popup.drop")}</p>
      <button class="button" type="button" onclick={() => fileInput?.click()}>{i18n.t("panel.add")}</button>
      <input bind:this={fileInput} class="file-input" type="file" accept={ACCEPTED_FILES} multiple tabindex="-1" aria-hidden="true" onchange={onPicked} />
    </div>
  </section>

  <Settings />
</main>

<style>
  :global(body) {
    margin: 0;
    background: var(--nf-bg);
    color: var(--nf-text);
    font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .popup {
    box-sizing: border-box;
    width: 360px;
    padding: 16px;
  }

  /* The add dialog opens over the popup; the popup grows to give it room. */
  .popup.editing {
    min-height: 560px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    line-height: 22px;
  }

  .version {
    margin: 0;
    color: var(--nf-muted);
    font-size: 12px;
    line-height: 16px;
  }

  :global(.popup-section) {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--nf-border);
  }

  :global(.popup-heading) {
    margin: 0 0 12px;
    color: var(--nf-muted);
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .total {
    min-height: 22px;
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: 600;
    line-height: 22px;
  }

  .counts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin: 0 0 8px;
  }

  .count {
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    border-radius: var(--nf-radius, 8px);
    background-color: var(--nf-bg-elevated);
  }

  .count dt {
    color: var(--nf-muted);
    font-size: 12px;
    line-height: 16px;
  }

  .count dd {
    min-height: 20px;
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    line-height: 20px;
  }

  .hint {
    margin: 0;
    color: var(--nf-muted);
    font-size: 12px;
    line-height: 16px;
  }

  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
    border: 2px dashed var(--nf-border);
    border-radius: var(--nf-radius, 8px);
    text-align: center;
    transition: border-color 0.15s ease;
  }

  .drop.dragging {
    border-color: var(--nf-accent);
  }

  /* Discord's primary button. */
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

  .button:hover {
    filter: brightness(0.9);
  }

  .button:focus-visible {
    outline: 2px solid var(--nf-accent);
    outline-offset: 2px;
  }

  .file-input {
    display: none;
  }
</style>
