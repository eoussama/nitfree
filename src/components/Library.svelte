<svelte:options css="injected" />

<!--
  The panel's content, laid out like Discord's emoji picker: a header with search and actions, a category
  sidebar, collapsible sections in a grid of square cells, and an inspector bar naming the hovered item.
  Shared by the Nitfree tab in Discord's picker and the standalone popover.

  Styles read Discord's own design tokens (--input-*, --control-*, --interactive-*, …), which inherit
  from Discord's page into this shadow root, so the panel matches Discord exactly in every theme. Each
  falls back to a Nitfree token for pages without them, such as the extension popup.
-->
<script lang="ts">
  import type { TItem } from "~/lib/db";
  import type { TGridKey } from "~/lib/ui/grid";
  import type { TSectionId } from "~/lib/ui/sections";

  import { tick } from "svelte";

  import { GRID_KEYS, nextTile } from "~/lib/ui/grid";
  import { library } from "~/lib/ui/library.svelte";
  import { buildSections, filterItems } from "~/lib/ui/sections";

  import Inspector from "./Inspector.svelte";
  import Tile from "./Tile.svelte";



  type TProps = {
    onpick?: (item: TItem, send: boolean) => void;
  };

  const { onpick = () => undefined }: TProps = $props();

  const ICONS: Record<TSectionId, string> = {
    favorites: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z",
    recent: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm1 2v4.6l3.2 1.9-1 1.7L11 12.7V7h2Z",
    all: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  };

  let query = $state("");
  let current = $state("");
  let inspected: TItem | null = $state(null);
  const collapsed: Partial<Record<TSectionId, boolean>> = $state({});
  let activeSection: TSectionId | null = $state(null);
  let search: HTMLInputElement | undefined = $state();
  let body: HTMLElement | undefined = $state();

  const sections = $derived(buildSections(filterItems(library.items, query)));
  const visibleKeys = $derived(sections.flatMap(section => (collapsed[section.id] ? [] : section.items.map(item => `${section.id}:${item.id}`))));
  const tabbableKey = $derived(visibleKeys.includes(current) ? current : (visibleKeys[0] ?? ""));
  const shown = $derived(inspected && library.items.some(item => item.id === inspected!.id) ? inspected : (sections[0]?.items[0] ?? null));

  function tiles(): HTMLElement[] {
    return body ? [...body.querySelectorAll<HTMLElement>("[data-tile]")] : [];
  }

  function onBodyKeydown(event: KeyboardEvent): void {
    const all = tiles();
    const from = all.findIndex(tile => tile === event.target);

    if (from === -1 || !GRID_KEYS.includes(event.key)) {
      return;
    }

    event.preventDefault();

    const to = nextTile(all.map(tile => tile.getBoundingClientRect()), from, event.key as TGridKey);

    // Up from the top row goes back to the search field.
    if (event.key === "ArrowUp" && to === from) {
      search?.focus();

      return;
    }

    all[to]?.focus();
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      tiles()[0]?.focus();
    }
  }

  function reducedMotion(): boolean {
    return document.documentElement.dataset.nfReducedMotion === "true";
  }

  function jumpTo(id: TSectionId): void {
    collapsed[id] = false;
    activeSection = id;
    body?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  }

  function onScroll(): void {
    if (!body) {
      return;
    }

    const top = body.getBoundingClientRect().top;
    const headers = [...body.querySelectorAll<HTMLElement>("[data-section]")];
    const passed = headers.filter(header => header.getBoundingClientRect().top - top <= 8);

    activeSection = (passed.at(-1) ?? headers[0])?.dataset.section as TSectionId | undefined ?? null;
  }

  /**
   * Puts the cursor in the search field, as Discord's picker does when it opens. Waits a tick so it
   * also works right after the panel is mounted, before the field is bound.
   */
  export function focusSearch(): void {
    void tick().then(() => search?.focus());
  }
</script>

<div class="library">
  <header class="header">
    <label class="search">
      <span class="search-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 0 1 5.6 11.2l4.6 4.6-1.4 1.4-4.6-4.6A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>
      </span>
      <input
        bind:this={search}
        bind:value={query}
        class="input"
        type="search"
        placeholder={i18n.t("panel.search")}
        aria-label={i18n.t("panel.search")}
        onkeydown={onSearchKeydown}
      />
    </label>
    <button class="icon-button" type="button" disabled aria-label={i18n.t("panel.filter")} title={i18n.t("panel.filter")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h7l11 11-6 6L4 10V4Zm4 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>
    </button>
    <button class="text-button" type="button" disabled>{i18n.t("panel.add")}</button>
  </header>

  <nav class="sidebar" aria-label={i18n.t("panel.sectionsLabel")}>
    {#each sections as section (section.id)}
      <button
        class="category"
        class:active={(activeSection ?? sections[0]?.id) === section.id}
        type="button"
        aria-label={i18n.t(`panel.sections.${section.id}`)}
        title={i18n.t(`panel.sections.${section.id}`)}
        onclick={() => jumpTo(section.id)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[section.id]} /></svg>
      </button>
    {/each}
  </nav>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div bind:this={body} class="body" onkeydown={onBodyKeydown} onscroll={onScroll}>
    {#if library.error}
      <p class="message">{i18n.t("panel.error")}</p>
    {:else if !library.loaded}
      <p class="message" aria-busy="true"></p>
    {:else if library.items.length === 0}
      <p class="message">{i18n.t("panel.placeholder")}</p>
    {:else if sections.length === 0}
      <p class="message">{i18n.t("panel.noResults", { query: query.trim() })}</p>
    {:else}
      {#each sections as section (section.id)}
        <section class="section" aria-labelledby="nf-section-{section.id}">
          <h3 class="section-header" data-section={section.id}>
            <button
              id="nf-section-{section.id}"
              class="section-toggle"
              type="button"
              aria-expanded={!collapsed[section.id]}
              onclick={() => {
                collapsed[section.id] = !collapsed[section.id];
              }}
            >
              <svg class="section-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[section.id]} /></svg>
              <span class="section-label">{i18n.t(`panel.sections.${section.id}`)}</span>
              <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.3 9.3a1 1 0 0 1 1.4 0L12 14.6l5.3-5.3a1 1 0 1 1 1.4 1.4l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4Z" /></svg>
            </button>
          </h3>
          {#if !collapsed[section.id]}
            <ul class="grid">
              {#each section.items as item (item.id)}
                {@const key = `${section.id}:${item.id}`}
                <li class="cell">
                  <Tile
                    {item}
                    tabbable={key === tabbableKey}
                    {onpick}
                    onfocus={() => {
                      current = key;
                    }}
                    oninspect={(found) => {
                      inspected = found;
                    }}
                  />
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    {/if}
  </div>

  <div class="inspector">
    <Inspector item={shown} />
  </div>
</div>

<style>
  .library,
  .library :global(*) {
    box-sizing: border-box;
  }

  .library {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
    min-height: 0;
    color: var(--text-default, var(--nf-text, #dbdee1));
    font-family: var(--font-primary, inherit);
    font-size: 16px;
    line-height: 16px;
  }

  /* Header: Discord's emoji picker header inside the expression picker. */
  .header {
    display: flex;
    grid-column: 1 / 3;
    align-items: center;
    gap: 12px;
    /* In Discord's picker the tab bar sits above; the popover has none, so it adds space on top. */
    padding: var(--nf-header-top, 0) 16px 12px;
    border-bottom: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
  }

  .search {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    gap: 4px;
    min-width: 0;
    height: var(--control-input-height-md, 40px);
    padding-inline-start: 4px;
    border: 1px solid var(--input-border-default, var(--nf-border, #3f4147));
    border-radius: var(--radius-sm, 8px);
    background-color: var(--input-background-default, rgb(0 0 0 / 8%));
    color: var(--input-text-default, var(--nf-text, #dbdee1));
    transition: border-color 0.1s;
  }

  .search:hover:not(:focus-within) {
    border-color: var(--input-border-hover, var(--nf-border, #3f4147));
  }

  .search:focus-within {
    border-color: var(--input-border-active, var(--nf-accent, #5865f2));
    outline: 2px solid var(--input-border-active, var(--nf-accent, #5865f2));
    outline-offset: -2px;
  }

  .search-icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
  }

  .search-icon svg {
    width: 16px;
    height: 16px;
    fill: var(--input-icon-default, var(--nf-muted, #949ba4));
  }

  .input {
    flex: 1 1 0%;
    min-width: 30%;
    height: 100%;
    padding: 1px 12px 1px 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 16px;
    line-height: 20px;
    outline: none;
  }

  .input::placeholder {
    color: var(--input-placeholder-text-default, var(--nf-muted, #949ba4));
  }

  .input::-webkit-search-cancel-button {
    display: none;
  }

  .icon-button {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 8px);
    background: transparent;
    cursor: pointer;
    transition: background-color 0.15s ease-out;
  }

  .icon-button svg {
    width: 20px;
    height: 20px;
    fill: var(--control-icon-only-icon-default, var(--nf-muted, #949ba4));
  }

  .icon-button:hover {
    background-color: var(--control-icon-only-background-hover, var(--nf-bg-hover, rgb(255 255 255 / 6%)));
  }

  .text-button {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    min-width: 100px;
    height: 40px;
    padding: 7px 15px;
    border: 1px solid var(--control-secondary-border-default, transparent);
    border-radius: var(--radius-sm, 8px);
    background-color: var(--control-secondary-background-default, rgb(151 151 159 / 12%));
    color: var(--control-secondary-text-default, #fff);
    font: inherit;
    font-size: 16px;
    font-weight: 500;
    line-height: 20px;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.15s ease-out, border-color 0.15s ease-out, color 0.15s ease-out;
  }

  .text-button:hover {
    border-color: var(--control-secondary-border-hover, transparent);
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
    color: var(--control-secondary-text-hover, #fff);
  }

  .text-button:active {
    border-color: var(--control-secondary-border-active, transparent);
    background-color: var(--control-secondary-background-active, rgb(151 151 159 / 20%));
    color: var(--control-secondary-text-active, #fff);
  }

  .icon-button:disabled,
  .text-button:disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .icon-button:focus-visible,
  .text-button:focus-visible,
  .category:focus-visible,
  .section-toggle:focus-visible {
    outline: 2px solid var(--border-focus, var(--nf-accent, #5865f2));
    outline-offset: -2px;
  }

  /* Sidebar: Discord's category list, beside the body and the inspector. */
  .sidebar {
    display: flex;
    flex-direction: column;
    grid-row: 2 / 4;
    grid-column: 1;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
    overflow: hidden;
    border-end-start-radius: 8px;
    background-color: var(--background-base-lower, var(--nf-bg, #313338));
  }

  .category {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background: transparent;
    cursor: pointer;
    transition: background-color 0.1s ease-in-out;
  }

  .category svg {
    width: 20px;
    height: 20px;
    fill: var(--interactive-icon-default, var(--nf-muted, #949ba4));
    transition: fill 0.1s ease-in-out;
  }

  .category:hover {
    background-color: var(--interactive-background-hover, var(--nf-bg-hover, rgb(255 255 255 / 6%)));
  }

  .category:hover svg {
    fill: var(--interactive-icon-hover, var(--nf-text, #dbdee1));
  }

  .category.active {
    background-color: var(--interactive-background-selected, rgb(151 151 159 / 20%));
  }

  .category.active svg {
    fill: var(--interactive-icon-active, var(--nf-text, #fff));
  }

  /* Body: the scrolling list of sections. */
  .body {
    position: relative;
    grid-row: 2;
    grid-column: 2;
    min-height: 0;
    overflow: hidden scroll;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thin-thumb, rgb(255 255 255 / 20%)) var(--scrollbar-thin-track, transparent);
  }

  .body::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .body::-webkit-scrollbar-track {
    background-color: var(--scrollbar-thin-track, transparent);
  }

  .body::-webkit-scrollbar-thumb {
    min-height: 40px;
    border: 2px solid transparent;
    border-radius: 4px;
    background-clip: padding-box;
    background-color: var(--scrollbar-thin-thumb, rgb(255 255 255 / 20%));
  }

  .section {
    padding-bottom: 8px;
  }

  .section-header {
    margin: 0;
    padding: 12px 8px 8px 16px;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    max-width: 100%;
    height: 18px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-default, var(--nf-text, #dbdee1));
    font: inherit;
    cursor: pointer;
    transition: color 0.125s;
  }

  .section-toggle:hover {
    color: var(--interactive-text-active, #fff);
  }

  .section-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin-inline-end: 8px;
    fill: currentcolor;
  }

  .section-label {
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin-inline-start: 4px;
    fill: currentcolor;
    transition: transform 0.1s;
  }

  .section-toggle[aria-expanded="false"] .chevron {
    transform: rotate(-90deg);
  }

  :global(html[data-nf-reduced-motion="true"]) .chevron {
    transition: none;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 48px);
    margin: 0;
    padding: 0 0 0 8px;
    list-style: none;
  }

  .cell {
    width: 48px;
    height: 48px;
    overflow: hidden;
  }

  .message {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    margin: 0;
    padding: 24px;
    text-align: center;
    font-size: 16px;
    line-height: 20px;
    color: var(--text-muted, var(--nf-muted, #949ba4));
  }

  .inspector {
    grid-row: 3;
    grid-column: 2;
  }
</style>
