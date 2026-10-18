<svelte:options css="injected" />

<!--
  The panel's content: header and sections. Shared by the Nitfree tab in Discord's picker and the
  standalone popover.
-->
<script lang="ts">
  import type { TItem } from "~/lib/db";
  import type { TGridKey } from "~/lib/ui/grid";

  import { tick } from "svelte";

  import { GRID_KEYS, nextTile } from "~/lib/ui/grid";
  import { library } from "~/lib/ui/library.svelte";
  import { buildSections, filterItems } from "~/lib/ui/sections";

  import Tile from "./Tile.svelte";



  type TProps = {
    onpick?: (item: TItem, send: boolean) => void;
  };

  const { onpick = () => undefined }: TProps = $props();

  let query = $state("");
  let current = $state("");
  let search: HTMLInputElement | undefined = $state();
  let body: HTMLElement | undefined = $state();

  const sections = $derived(buildSections(filterItems(library.items, query)));
  const firstKey = $derived(sections[0] ? `${sections[0].id}:${sections[0].items[0]!.id}` : "");
  const tabbableKey = $derived(sections.some(section => section.items.some(item => `${section.id}:${item.id}` === current)) ? current : firstKey);

  function tiles(): HTMLElement[] {
    return body ? [...body.querySelectorAll<HTMLElement>("[data-tile]")] : [];
  }

  function onBodyKeydown(event: KeyboardEvent): void {
    const all = tiles();
    const from = all.findIndex(tile => tile === event.target);

    if (from === -1) {
      return;
    }

    if (!GRID_KEYS.includes(event.key)) {
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
      <input
        bind:this={search}
        bind:value={query}
        class="input"
        type="search"
        placeholder={i18n.t("panel.search")}
        aria-label={i18n.t("panel.search")}
        onkeydown={onSearchKeydown}
      />
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 0 1 5.6 11.2l4.6 4.6-1.4 1.4-4.6-4.6A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>
    </label>
    <button class="action" type="button" disabled aria-label={i18n.t("panel.filter")} title={i18n.t("panel.filter")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h7l11 11-6 6L4 10V4Zm4 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>
    </button>
    <button class="action" type="button" disabled aria-label={i18n.t("panel.add")} title={i18n.t("panel.add")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" /></svg>
    </button>
  </header>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div bind:this={body} class="body" onkeydown={onBodyKeydown}>
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
          <h3 class="heading" id="nf-section-{section.id}">{i18n.t(`panel.sections.${section.id}`)}</h3>
          <ul class="grid">
            {#each section.items as item (item.id)}
              {@const key = `${section.id}:${item.id}`}
              <li>
                <Tile
                  {item}
                  tabbable={key === tabbableKey}
                  {onpick}
                  onfocus={() => {
                    current = key;
                  }}
                />
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    {/if}
  </div>
</div>

<style>
  .library,
  .library :global(*) {
    box-sizing: border-box;
  }

  .library {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--nf-text, #dbdee1);
  }

  .header {
    display: flex;
    gap: 8px;
    padding: 12px 12px 8px;
  }

  .search {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
  }

  .input {
    width: 100%;
    height: 32px;
    padding: 0 32px 0 8px;
    border: 1px solid var(--nf-border, #3f4147);
    border-radius: calc(var(--nf-radius, 8px) - 4px);
    background: var(--nf-bg, #313338);
    color: inherit;
    font: inherit;
    font-size: 14px;
    outline: none;
  }

  .input:focus-visible {
    border-color: var(--nf-accent, #5865f2);
  }

  .input::-webkit-search-cancel-button {
    display: none;
  }

  .icon {
    position: absolute;
    right: 8px;
    width: 18px;
    height: 18px;
    fill: var(--nf-muted, #949ba4);
    pointer-events: none;
  }

  .action {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--nf-border, #3f4147);
    border-radius: calc(var(--nf-radius, 8px) - 4px);
    background: var(--nf-bg, #313338);
    cursor: pointer;
  }

  .action svg {
    width: 18px;
    height: 18px;
    fill: var(--nf-muted, #949ba4);
  }

  .action:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .action:focus-visible {
    outline: 2px solid var(--nf-accent, #5865f2);
  }

  .body {
    flex: 1;
    min-height: 0;
    padding: 0 8px 12px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .section + .section {
    margin-top: 8px;
  }

  .heading {
    margin: 8px 4px 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--nf-muted, #949ba4);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .message {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    margin: 0;
    padding: 24px;
    text-align: center;
    font-size: 14px;
    color: var(--nf-muted, #949ba4);
  }
</style>
