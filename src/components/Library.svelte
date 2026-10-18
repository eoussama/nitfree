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

  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Clock from "@lucide/svelte/icons/clock";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import Search from "@lucide/svelte/icons/search";
  import Star from "@lucide/svelte/icons/star";
  import Tag from "@lucide/svelte/icons/tag";
  import { tick } from "svelte";

  import { ACCEPTED_FILES } from "~/lib/ui/drafts";
  import { startAdd } from "~/lib/ui/editor.svelte";
  import { GRID_KEYS, nextTile } from "~/lib/ui/grid";
  import { library } from "~/lib/ui/library.svelte";
  import { openMenu } from "~/lib/ui/menu.svelte";
  import { buildSections, filterItems } from "~/lib/ui/sections";
  import { focusAfterRemoval } from "~/lib/ui/tiles";
  import { deleteWithUndo, trash } from "~/lib/ui/trash.svelte";

  import Inspector from "./Inspector.svelte";
  import Tile from "./Tile.svelte";



  type TProps = {
    onpick?: (item: TItem, send: boolean) => void;
  };

  const { onpick = () => undefined }: TProps = $props();

  const ICONS: Record<TSectionId, typeof Star> = {
    favorites: Star,
    recent: Clock,
    all: LayoutGrid,
  };

  /**
   * How long a sidebar jump may keep the scroll position from moving the highlight, in case the
   * scroll never ends with a scrollend event (nothing to scroll, or no scrollend support).
   */
  const JUMP_TIMEOUT = 1000;

  let query = $state("");
  let current = $state("");
  let inspectedId: string | null = $state(null);
  const collapsed: Partial<Record<TSectionId, boolean>> = $state({});
  let activeSection: TSectionId | null = $state(null);
  let jumping = false;
  let reduced = $state(reducedMotion());
  let search: HTMLInputElement | undefined = $state();
  let body: HTMLElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let dragging = $state(false);

  // Items deleted in this tab disappear at once, while their deletion can still be undone.
  const items = $derived(library.items.filter(item => !trash.pending.some(pending => pending.item.id === item.id)));
  const sections = $derived(buildSections(filterItems(items, query)));
  // While searching, every match shows, whatever the user collapsed; their choice comes back after.
  const searching = $derived(query.trim() !== "");
  const isCollapsed = (id: TSectionId): boolean => !searching && collapsed[id] === true;
  const visible = $derived(sections.flatMap(section => (isCollapsed(section.id) ? [] : section.items.map(item => ({ key: `${section.id}:${item.id}`, item })))));
  const tabbableKey = $derived(visible.some(entry => entry.key === current) ? current : (visible[0]?.key ?? ""));
  // The inspector names the hovered item while it is on screen, else the first item shown.
  const shown = $derived(visible.find(entry => entry.item.id === inspectedId)?.item ?? visible[0]?.item ?? null);
  const highlighted = $derived(sections.some(section => section.id === activeSection) ? activeSection : (sections[0]?.id ?? null));

  // Discord's reduced motion lives on <html>, which the styles in this shadow root cannot see.
  $effect(() => {
    const observer = new MutationObserver(() => {
      reduced = reducedMotion();
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-nf-reduced-motion"] });

    return () => observer.disconnect();
  });

  function tiles(): HTMLElement[] {
    return body ? [...body.querySelectorAll<HTMLElement>("[data-tile]")] : [];
  }

  function itemOf(tile: Element | null): TItem | null {
    const id = tile?.closest<HTMLElement>("[data-tile]")?.dataset.tile;

    return items.find(item => item.id === id) ?? null;
  }

  function onBodyKeydown(event: KeyboardEvent): void {
    const all = tiles();
    const from = all.findIndex(tile => tile === event.target);

    if (from === -1) {
      return;
    }

    // The menu key or Shift+F10 opens the item's menu under the tile; Delete removes it, with undo.
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      const item = itemOf(all[from]!);
      const rect = all[from]!.getBoundingClientRect();

      event.preventDefault();

      if (item) {
        openMenu(item, rect.left, rect.bottom, all[from]!);
      }

      return;
    }

    if (event.key === "Delete") {
      const item = itemOf(all[from]!);

      event.preventDefault();
      focusAfterRemoval(all[from]!);

      if (item) {
        deleteWithUndo(item);
      }

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

  function onContextMenu(event: MouseEvent): void {
    const tile = (event.target as Element | null)?.closest<HTMLElement>("[data-tile]") ?? null;
    const item = itemOf(tile);

    // Discord opens its own menus on right-click; this one is Nitfree's.
    if (item) {
      event.preventDefault();
      event.stopPropagation();
      openMenu(item, event.clientX, event.clientY, tile);
    }
  }

  function hasFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes("Files") ?? false;
  }

  // Dropped files are added to Nitfree, not uploaded to the channel by Discord.
  function onDragOver(event: DragEvent): void {
    if (hasFiles(event)) {
      event.preventDefault();
      event.stopPropagation();
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

    if (hasFiles(event)) {
      event.preventDefault();
      event.stopPropagation();
      void startAdd(event.dataTransfer?.files ?? []);
    }
  }

  // Pasting an image adds it; pasting text into the search field still works as usual.
  function onPaste(event: ClipboardEvent): void {
    const files = [...event.clipboardData?.files ?? []];

    if (files.length) {
      event.preventDefault();
      event.stopPropagation();
      void startAdd(files);
    }
  }

  function onPicked(): void {
    void startAdd(fileInput?.files ?? []);

    if (fileInput) {
      fileInput.value = "";
    }
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

  function stopJumping(): void {
    jumping = false;
  }

  async function jumpTo(id: TSectionId): Promise<void> {
    collapsed[id] = false;
    activeSection = id;

    // Let the section render first, or the scroll stops at the old, shorter height.
    await tick();

    jumping = true;
    setTimeout(stopJumping, JUMP_TIMEOUT);
    body?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }

  function onScroll(): void {
    // The scroll from a sidebar jump must not move the highlight off the section that was clicked.
    if (!body || jumping) {
      return;
    }

    const top = body.getBoundingClientRect().top;
    const headers = [...body.querySelectorAll<HTMLElement>("[data-section]")];
    const passed = headers.filter(header => header.getBoundingClientRect().top - top <= 8);
    // A short last section never reaches the top; at the bottom of the list it is the one in view.
    const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
    const section = (atBottom ? headers.at(-1) : passed.at(-1)) ?? headers[0];

    activeSection = (section?.dataset.section as TSectionId | undefined) ?? null;
  }

  /**
   * Puts the cursor in the search field, as Discord's picker does when it opens. Waits a tick so it
   * also works right after the panel is mounted, before the field is bound.
   */
  export function focusSearch(): void {
    void tick().then(() => search?.focus());
  }
</script>

<!--
  Focusable, so a click anywhere in the panel keeps focus in it: a paste then lands here, not in
  Discord's chat box, which takes pastes made while nothing editable has focus.
-->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="library"
  class:reduced
  class:dragging
  tabindex="-1"
  ondragenter={onDragOver}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  onpaste={onPaste}
>
  <header class="header">
    <label class="search">
      <span class="search-icon" aria-hidden="true"><Search size={16} /></span>
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
      <Tag size={20} aria-hidden="true" />
    </button>
    <button class="text-button" type="button" onclick={() => fileInput?.click()}>{i18n.t("panel.add")}</button>
    <input bind:this={fileInput} class="file-input" type="file" accept={ACCEPTED_FILES} multiple tabindex="-1" aria-hidden="true" onchange={onPicked} />
  </header>

  {#if dragging}
    <div class="drop" aria-hidden="true">{i18n.t("editor.drop")}</div>
  {/if}

  <nav class="sidebar" aria-label={i18n.t("panel.sectionsLabel")}>
    <div class="categories">
      {#each sections as section (section.id)}
        {@const Icon = ICONS[section.id]}
        <button
          class="category"
          class:active={highlighted === section.id}
          type="button"
          aria-label={i18n.t(`panel.sections.${section.id}`)}
          title={i18n.t(`panel.sections.${section.id}`)}
          onclick={() => void jumpTo(section.id)}
        >
          <Icon size={20} aria-hidden="true" />
        </button>
      {/each}
    </div>
    <!-- Level with the inspector, its border running across the whole panel as in Discord. -->
    <div class="sidebar-footer"></div>
  </nav>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={body}
    class="body"
    onkeydown={onBodyKeydown}
    oncontextmenu={onContextMenu}
    onscroll={onScroll}
    onscrollend={stopJumping}
    onwheel={stopJumping}
    onpointerdown={stopJumping}
  >
    {#if library.error}
      <p class="message">{i18n.t("panel.error")}</p>
    {:else if !library.loaded}
      <p class="message" aria-busy="true"></p>
    {:else if items.length === 0}
      <p class="message">{i18n.t("panel.placeholder")}</p>
    {:else if sections.length === 0}
      <p class="message">{i18n.t("panel.noResults", { query: query.trim() })}</p>
    {:else}
      {#each sections as section (section.id)}
        {@const SectionIcon = ICONS[section.id]}
        <section class="section" aria-labelledby="nf-section-{section.id}">
          <h3 class="section-header" data-section={section.id}>
            <button
              id="nf-section-{section.id}"
              class="section-toggle"
              type="button"
              aria-expanded={!isCollapsed(section.id)}
              disabled={searching}
              onclick={() => {
                collapsed[section.id] = !collapsed[section.id];
              }}
            >
              <span class="section-icon" aria-hidden="true"><SectionIcon size={16} /></span>
              <span class="section-label">{i18n.t(`panel.sections.${section.id}`)}</span>
              <span class="chevron" aria-hidden="true"><ChevronDown size={16} /></span>
            </button>
          </h3>
          {#if !isCollapsed(section.id)}
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
                      inspectedId = found.id;
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

  .library:focus {
    outline: none;
  }

  .library {
    position: relative;
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
    color: var(--input-icon-default, var(--nf-muted, #949ba4));
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
    color: var(--control-icon-only-icon-default, var(--nf-muted, #949ba4));
    cursor: pointer;
    transition: background-color 0.15s ease-out;
  }


  .icon-button:hover:not(:disabled) {
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

  /* The disabled filter button still shows its tooltip, so it keeps taking the pointer. */
  .icon-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .file-input {
    display: none;
  }

  /* Shown while files are dragged over the panel. */
  .drop {
    position: absolute;
    inset: 8px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    border: 2px dashed var(--border-focus, var(--nf-accent, #5865f2));
    border-radius: 8px;
    background-color: var(--background-base-lower, var(--nf-bg, #313338));
    color: var(--text-strong, var(--nf-text, #fff));
    font-size: 16px;
    font-weight: 600;
    line-height: 20px;
    text-align: center;
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
    min-height: 0;
    border-end-start-radius: 8px;
    background-color: var(--background-base-lower, var(--nf-bg, #313338));
  }

  /* The first icon is centered on the first section's header, like Discord's. */
  .categories {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-height: 0;
    padding: 1px 0 8px;
    overflow: hidden;
  }

  .sidebar-footer {
    flex: none;
    height: 48px;
    border-top: 1px solid var(--border-normal, var(--nf-border, #3f4147));
  }

  .category {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-md, 12px);
    background: transparent;
    color: var(--interactive-icon-default, var(--nf-muted, #949ba4));
    cursor: pointer;
    transition: background-color 0.1s ease-in-out, color 0.1s ease-in-out;
  }

  .category:hover {
    background-color: var(--interactive-background-hover, var(--nf-bg-hover, rgb(255 255 255 / 6%)));
    color: var(--interactive-icon-hover, var(--nf-text, #dbdee1));
  }

  /* Like Discord, the selected category has no box: a bright icon and the pill. */
  .category.active {
    color: var(--interactive-icon-active, var(--nf-text, #fff));
  }

  /*
    Discord's pill on the sidebar's edge, as in its server list: hovering slides a small half-round in
    from the edge, selecting grows it, and the category left behind shrinks its pill away to the edge.
  */
  .category::before {
    position: absolute;
    inset-inline-start: -8px;
    top: 50%;
    width: 4px;
    height: 0;
    border-start-end-radius: 4px;
    border-end-end-radius: 4px;
    background-color: var(--text-strong, var(--nf-text, #fff));
    content: "";
    pointer-events: none;
    transform: translate(-4px, -50%);
    transition:
      height 0.2s ease-out,
      transform 0.2s ease-out;
  }

  .category:hover::before {
    height: 8px;
    transform: translate(0, -50%);
  }

  .category.active::before {
    height: 20px;
    transform: translate(0, -50%);
  }

  /* Body: the scrolling list of sections. */
  .body {
    position: relative;
    grid-row: 2;
    grid-column: 2;
    min-height: 0;
    overflow: hidden scroll;
    scrollbar-gutter: stable;
  }

  /* Setting these turns off the ::-webkit-scrollbar styles below in Chromium, so like Discord they only
     apply where those do not exist (Firefox). */
  @supports not selector(::-webkit-scrollbar) {
    .body {
      scrollbar-width: thin;
      scrollbar-color: var(--scrollbar-thin-thumb, rgb(255 255 255 / 20%)) var(--scrollbar-thin-track, transparent);
    }
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

  .body::-webkit-scrollbar-corner {
    background-color: transparent;
  }

  .section {
    padding-bottom: 8px;
  }

  /* Aligned with the first cell, as in Discord. */
  .section-header {
    margin: 0;
    padding: 8px 8px 6px;
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

  .section-toggle:disabled {
    cursor: default;
  }

  .section-toggle:hover:not(:disabled) {
    color: var(--interactive-text-active, #fff);
  }

  .section-icon {
    display: flex;
    flex-shrink: 0;
    margin-inline-end: 4px;
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
    display: flex;
    flex-shrink: 0;
    margin-inline-start: 4px;
    transition: transform 0.1s;
  }

  .section-toggle[aria-expanded="false"] .chevron {
    transform: rotate(-90deg);
  }

  .reduced .chevron,
  .reduced .category,
  .reduced .category::before,
  .reduced .section-toggle {
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
