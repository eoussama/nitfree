<!--
  The extension popup: the library at a glance, live as it changes in Discord tabs, a place to add
  files through the same dialog as in Discord, and links to the backup, packs, storage, duplicates, themes and settings pages,
  each opened in place like a page of Discord's settings. The diagnostics page opens from the
  settings, and goes back to them. Styled with the last palette seen on Discord, or the OS light or
  dark one before any.
-->
<script lang="ts">
  import type { Component } from "svelte";

  import Activity from "@lucide/svelte/icons/activity";
  import Archive from "@lucide/svelte/icons/archive";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Copy from "@lucide/svelte/icons/copy";
  import HardDrive from "@lucide/svelte/icons/hard-drive";
  import Package from "@lucide/svelte/icons/package";
  import Palette from "@lucide/svelte/icons/palette";
  import Cog from "@lucide/svelte/icons/settings";
  import { tick } from "svelte";

  import Logo from "~/components/Logo.svelte";
  import { ITEM_TYPES } from "~/lib/db/types";
  import { followStoredTheme } from "~/lib/theme";
  import { ACCEPTED_FILES } from "~/lib/ui/drafts";
  import { editor, startAdd } from "~/lib/ui/editor.svelte";
  import { followLibrary, library } from "~/lib/ui/library.svelte";
  import { tooltip } from "~/lib/ui/tooltip.svelte";
  import { isArchiveFile, pickImport } from "~/lib/ui/transfer.svelte";

  import Diagnostics from "./Diagnostics.svelte";
  import Duplicates from "./Duplicates.svelte";
  import Packs from "./Packs.svelte";
  import Settings from "./Settings.svelte";
  import Storage from "./Storage.svelte";
  import Themes from "./Themes.svelte";
  import Transfer from "./Transfer.svelte";



  type TPage = "backup" | "packs" | "storage" | "duplicates" | "themes" | "settings" | "diagnostics";

  type TPageEntry = {
    page: TPage;
    title: string;
    icon: Component<{ size?: number }>;
    content: Component;

    /**
     * The page it opens from and goes back to, for a page the home does not list.
     */
    parent?: TPage;
  };

  const { version } = browser.runtime.getManifest();
  const REPOSITORY = "https://github.com/eoussama/nitfree";
  const locale = i18n.t("locale");

  const PAGES: TPageEntry[] = [
    { page: "packs", title: i18n.t("editor.packs"), icon: Package, content: Packs },
    { page: "themes", title: i18n.t("popup.themes.heading"), icon: Palette, content: Themes },
    { page: "duplicates", title: i18n.t("popup.duplicates.heading"), icon: Copy, content: Duplicates },
    { page: "storage", title: i18n.t("popup.storage.heading"), icon: HardDrive, content: Storage },
    { page: "backup", title: i18n.t("popup.transfer.heading"), icon: Archive, content: Transfer },
    { page: "settings", title: i18n.t("popup.settings"), icon: Cog, content: Settings },
    { page: "diagnostics", title: i18n.t("diagnostics.heading"), icon: Activity, content: Diagnostics, parent: "settings" },
  ];

  const LINKED = PAGES.filter(entry => !entry.parent);

  let fileInput: HTMLInputElement | undefined = $state();
  let dragging = $state(false);
  let scrolled = $state(false);
  let page: TPage | null = $state(null);

  const counts = $derived(ITEM_TYPES.map(type => ({ type, count: library.items.filter(item => item.type === type).length })));
  const current = $derived(PAGES.find(entry => entry.page === page) ?? null);

  document.documentElement.lang = locale;

  $effect(() => followStoredTheme(document.documentElement));
  $effect(() => followLibrary());

  // Each page starts at the top, with focus on its way back; going back puts focus on the page's link.
  async function open(next: TPage | null): Promise<void> {
    const previous = page;
    const back = next === (PAGES.find(entry => entry.page === previous)?.parent ?? null);

    page = next;
    window.scrollTo(0, 0);
    await tick();

    const target = back ? `[data-page="${previous}"]` : "[data-back]";

    document.querySelector<HTMLElement>(target)?.focus();
  }

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
      void dropped([...event.dataTransfer?.files ?? []]);
    }
  }

  // A backup or zip dropped here is imported, on the backup page; images are added.
  function dropped(files: File[]): Promise<void> {
    const [first] = files;

    if (files.length === 1 && first && isArchiveFile(first)) {
      void open("backup");

      return pickImport(first);
    }

    return startAdd(files);
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

<svelte:window
  onpaste={onPaste}
  onscroll={() => {
    scrolled = window.scrollY > 0;
  }}
/>

<main class="popup" class:editing={editor.mode !== null} ondragenter={onDragOver} ondragover={onDragOver} ondragleave={onDragLeave} ondrop={onDrop}>
  <header class="header" class:scrolled>
    {#if current}
      <button class="icon-button" type="button" data-back aria-label={i18n.t("popup.back")} onclick={() => void open(current.parent ?? null)} {@attach tooltip(i18n.t("popup.back"), "bottom")}>
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <h1 id="nf-page-title" class="page-title">{current.title}</h1>
    {:else}
      <span class="logo" role="img" aria-label={i18n.t("popup.logo")}><Logo lively /></span>
      <div>
        <h1 class="title">{i18n.t("extName")}</h1>
        <p class="version">{i18n.t("popup.version", { version })}</p>
      </div>
      <a class="icon-button github" href={REPOSITORY} target="_blank" rel="noreferrer" aria-label={i18n.t("popup.github")} {@attach tooltip(i18n.t("popup.github"), "bottom")}>
        <!-- GitHub's mark; Lucide has no brand icons. -->
        <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
        </svg>
      </a>
    {/if}
  </header>

  {#if current}
    {@const Content = current.content}
    <section class="page" aria-labelledby="nf-page-title">
      {#if current.page === "settings"}
        <Settings onopen={target => void open(target)} />
      {:else}
        <Content />
      {/if}
    </section>
  {:else}
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
      {/if}
    </section>

    <section class="popup-section" aria-labelledby="nf-add">
      <h2 id="nf-add" class="popup-heading">{i18n.t("popup.add")}</h2>
      <div class="drop" class:dragging>
        <p class="hint">{i18n.t("popup.drop")}</p>
        <button class="button primary" type="button" onclick={() => fileInput?.click()}>{i18n.t("panel.add")}</button>
        <input bind:this={fileInput} class="file-input" type="file" accept={ACCEPTED_FILES} multiple tabindex="-1" aria-hidden="true" onchange={onPicked} />
      </div>
    </section>

    <nav class="popup-section" aria-label={i18n.t("popup.pages")}>
      <ul class="links">
        {#each LINKED as { page: target, title, icon: Icon } (target)}
          <li>
            <button class="link" type="button" data-page={target} onclick={() => void open(target)}>
              <span class="link-icon"><Icon size={20} /></span>
              <span class="link-title">{title}</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
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

  /* Stays at the top while the rest scrolls, with a line under it once something passes beneath. */
  .header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    margin: -16px -16px 0;
    padding: 16px;
    border-bottom: 1px solid transparent;
    background: var(--nf-bg);
    transition: border-color 0.15s ease;
  }

  .header.scrolled {
    border-bottom-color: var(--nf-border);
  }

  /* Discord's icon button. */
  .icon-button {
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
    color: var(--interactive-icon-default, var(--nf-muted));
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .icon-button:hover {
    background-color: var(--interactive-background-hover, var(--nf-mod-normal));
    color: var(--interactive-icon-hover, var(--nf-text));
  }

  .icon-button:focus-visible,
  .link:focus-visible {
    outline: 2px solid var(--nf-accent);
    outline-offset: 2px;
  }

  .github {
    margin-inline-start: auto;
  }

  .logo {
    display: block;
    flex: none;
    width: 40px;
    height: 40px;
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

  /* Discord's settings page title. */
  .page-title {
    margin: 0;
    color: var(--text-strong, var(--nf-text));
    font-size: 20px;
    font-weight: 600;
    line-height: 24px;
  }

  .page {
    padding-top: 8px;
  }

  .popup-section {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--nf-border);
  }

  /* Under the header, only the header's own line shows, and only once the popup scrolls. */
  .header + .popup-section {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }

  .popup-heading {
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
    margin: 0;
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

  .file-input {
    display: none;
  }

  /* Discord's settings list: one row per page, in a filled group, a line between rows. */
  .links {
    margin: 0;
    padding: 0;
    overflow: hidden;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--nf-bg-elevated);
    list-style: none;
  }

  .links li + li {
    border-top: 1px solid var(--border-subtle, var(--nf-border));
  }

  .link {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 0 12px;
    border: none;
    background: none;
    color: var(--interactive-text-default, var(--nf-text));
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .link:hover {
    background-color: var(--background-mod-subtle, var(--nf-mod-subtle));
    color: var(--interactive-text-active, var(--nf-text));
  }

  .link-icon {
    display: flex;
    color: var(--interactive-icon-default, var(--nf-muted));
  }

  .link-title {
    flex: 1;
    font-size: 16px;
    font-weight: 500;
    line-height: 20px;
  }

  .link :global(.lucide-chevron-right) {
    flex: none;
    color: var(--interactive-icon-default, var(--nf-muted));
  }
</style>
