<svelte:options css="injected" />

<!--
  The panel's filter menu, dropped from the filter button: toggles for the four types, then the tags
  that items carry, as a checklist with a field to find one when there are many. Choices apply at once;
  Escape or a click elsewhere closes it, and the panel shows what is chosen as chips.
-->
<script lang="ts">
  import type { TItemType, TTag } from "~/lib/db/types";
  import type { TFilterOption, TFilters } from "~/lib/ui/filters";

  import Check from "@lucide/svelte/icons/check";
  import { tick } from "svelte";

  import { onEscape } from "~/lib/ui/escape";
  import { filterCount, findTagOptions } from "~/lib/ui/filters";



  type TProps = {
    types: TFilterOption<TItemType>[];
    tags: TFilterOption<string>[];
    names: readonly TTag[];
    filters: TFilters;
    ontype: (type: TItemType) => void;
    ontag: (id: string) => void;
    onclear: () => void;
    onclose: (refocus: boolean) => void;
  };

  const { types, tags, names, filters, ontype, ontag, onclear, onclose }: TProps = $props();

  /**
   * Past this many tags, the menu offers a field to find one by name.
   */
  const FIND_FROM = 8;

  let element: HTMLElement | undefined = $state();
  let find = $state("");

  const nameOf = (id: string): string => names.find(tag => tag.id === id)?.name ?? id;
  const shown = $derived(findTagOptions(tags, names, find));

  // Escape closes the menu before anything else sees it.
  $effect(() => onEscape(() => onclose(true)));

  // Keyboard users land on the first choice; there is always one, as the types are always offered.
  function focusFirst(): void {
    void tick().then(() => element?.querySelector<HTMLElement>("button, input")?.focus());
  }

  $effect(focusFirst);

  // The clear button goes once nothing is chosen, so focus moves on to the choices.
  function clear(): void {
    onclear();
    focusFirst();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const all = [...element?.querySelectorAll<HTMLElement>(".tag-find, .tag input:not(:disabled)") ?? []];
    const from = all.indexOf(event.target as HTMLElement);

    if (from === -1) {
      return;
    }

    event.preventDefault();
    all[Math.min(Math.max(from + (event.key === "ArrowDown" ? 1 : -1), 0), all.length - 1)]?.focus();
  }
</script>

<div
  bind:this={element}
  class="menu"
  role="dialog"
  tabindex="-1"
  aria-label={i18n.t("panel.filter")}
  onkeydown={onKeydown}
>
  <div class="group" role="group" aria-labelledby="nf-filter-types">
    <h4 id="nf-filter-types" class="heading">{i18n.t("panel.filters.type")}</h4>
    <div class="types">
      {#each types as option (option.value)}
        {@const chosen = filters.types.includes(option.value)}
        <button
          class="type"
          class:chosen
          class:empty={option.count === 0 && !chosen}
          type="button"
          aria-pressed={chosen}
          onclick={() => ontype(option.value)}
        >
          {i18n.t(`panel.types.${option.value}`)}
          <span class="count">{option.count}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="group tags" role="group" aria-labelledby="nf-filter-tags">
    <h4 id="nf-filter-tags" class="heading">{i18n.t("panel.filters.tags")}</h4>

    {#if tags.length === 0}
      <p class="hint">{i18n.t("panel.filters.noTags")}</p>
    {:else}
      {#if tags.length > FIND_FROM}
        <input bind:value={find} class="tag-find" type="search" placeholder={i18n.t("panel.filters.find")} aria-label={i18n.t("panel.filters.find")} />
      {/if}

      <div class="list">
        {#each shown as option (option.value)}
          <label class="tag">
            <input type="checkbox" checked={filters.tags.includes(option.value)} onchange={() => ontag(option.value)} />
            <span class="box" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
            <span class="name">{nameOf(option.value)}</span>
            <span class="count">{option.count}</span>
          </label>
        {:else}
          <p class="hint">{i18n.t("panel.filters.noMatch", { query: find.trim() })}</p>
        {/each}
      </div>
    {/if}
  </div>

  {#if filterCount(filters) > 0}
    <button class="clear" type="button" onclick={clear}>{i18n.t("panel.filters.clear")}</button>
  {/if}
</div>

<style>
  .menu {
    position: absolute;
    inset-block-start: calc(100% + 8px);
    inset-inline-end: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
    width: 288px;
    max-height: 320px;
    padding: 8px;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-surface-higher, var(--nf-bg-elevated, #2b2d31));
    box-shadow: var(--shadow-high, 0 8px 16px rgb(0 0 0 / 24%));
    color: var(--text-default, var(--nf-text, #dbdee1));
    font-family: var(--font-primary, inherit);
    outline: none;
  }

  .menu :global(*) {
    box-sizing: border-box;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }

  .tags {
    flex: 1 1 auto;
  }

  .heading {
    margin: 0;
    padding: 0 4px;
    color: var(--text-muted, var(--nf-muted, #949ba4));
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .types {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .type {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: 14px;
    background: transparent;
    color: var(--interactive-text-default, var(--nf-text, #dbdee1));
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    cursor: pointer;
    transition: background-color 0.1s, border-color 0.1s, color 0.1s;
  }

  .type:hover:not(.chosen) {
    background-color: var(--background-mod-subtle, rgb(151 151 159 / 12%));
    color: var(--interactive-text-active, #fff);
  }

  .type.chosen {
    border-color: var(--control-brand-foreground-new, var(--brand-500, #5865f2));
    background-color: var(--control-brand-foreground-new, var(--brand-500, #5865f2));
    color: var(--white, #fff);
  }

  /* Nothing of this type yet: still there, so the menu keeps its shape, but out of the way. */
  .type.empty {
    opacity: 0.5;
  }

  .count {
    color: var(--text-muted, var(--nf-muted, #949ba4));
    font-size: 12px;
    font-weight: 500;
  }

  .chosen .count {
    color: inherit;
    opacity: 0.8;
  }

  .tag-find {
    flex: none;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--input-border-default, var(--nf-border, #3f4147));
    border-radius: var(--radius-xs, 4px);
    background-color: var(--input-background-default, rgb(0 0 0 / 8%));
    color: var(--input-text-default, var(--nf-text, #dbdee1));
    font: inherit;
    font-size: 14px;
    line-height: 18px;
    outline: none;
  }

  .tag-find::placeholder {
    color: var(--input-placeholder-text-default, var(--nf-muted, #949ba4));
  }

  .tag-find::-webkit-search-cancel-button {
    display: none;
  }

  .tag-find:focus {
    border-color: var(--input-border-active, var(--nf-accent, #5865f2));
  }

  .list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }

  .tag {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 4px 8px;
    border-radius: var(--radius-xs, 4px);
    cursor: pointer;
  }

  .tag:hover {
    background-color: var(--background-mod-subtle, rgb(151 151 159 / 12%));
  }

  /* The real checkbox stays for keyboards and screen readers; the box next to it is what shows. */
  .tag input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .box {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: 2px solid var(--interactive-icon-default, var(--nf-muted, #949ba4));
    border-radius: var(--radius-xs, 4px);
    color: transparent;
  }

  input:checked + .box {
    border-color: var(--control-brand-foreground-new, var(--brand-500, #5865f2));
    background-color: var(--control-brand-foreground-new, var(--brand-500, #5865f2));
    color: var(--white, #fff);
  }

  .tag:has(input:focus-visible),
  .type:focus-visible,
  .clear:focus-visible {
    outline: 2px solid var(--border-focus, var(--nf-accent, #5865f2));
    outline-offset: -2px;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    margin: 0;
    padding: 4px;
    color: var(--text-muted, var(--nf-muted, #949ba4));
    font-size: 14px;
    line-height: 18px;
  }

  .clear {
    flex: none;
    height: 32px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-xs, 4px);
    background: none;
    color: var(--text-link, var(--nf-accent, #00a8fc));
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    text-align: start;
    cursor: pointer;
  }

  .clear:hover {
    text-decoration: underline;
  }
</style>
