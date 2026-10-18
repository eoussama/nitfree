<svelte:options css="injected" />

<!--
  Tag field: chosen tags as chips, a text field that suggests existing tags as you type, and Enter or a
  comma to add one, new or existing.
-->
<script lang="ts">
  import type { TTag } from "~/lib/db";

  import { parseTagNames, suggestTags } from "~/lib/ui/drafts";
  import { onEscape } from "~/lib/ui/escape";



  type TProps = {
    tags: string[];
    available: readonly TTag[];
    id: string;
    label: string;
  };

  let { tags = $bindable(), available, id, label }: TProps = $props();

  let text = $state("");
  let input: HTMLInputElement | undefined = $state();
  let focused = $state(false);
  // Escape hides the suggestions until the user types again.
  let dismissed = $state(false);
  // -1 until the user moves through the suggestions with the arrow keys.
  let highlighted = $state(-1);

  const suggestions = $derived(focused && !dismissed ? suggestTags(text, available, tags) : []);
  const listId = $derived(`${id}-suggestions`);

  $effect(() => {
    if (suggestions.length) {
      return onEscape(() => {
        dismissed = true;
        highlighted = -1;
      });
    }
  });

  function add(name: string): void {
    // A name that matches an existing tag, whatever its case, takes that tag's spelling.
    const existing = available.find(tag => tag.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());

    tags = parseTagNames([...tags, existing?.name ?? name].join(","));
    text = "";
    highlighted = -1;
  }

  function remove(name: string): void {
    tags = tags.filter(tag => tag !== name);
  }

  function move(step: number): void {
    highlighted = (Math.max(highlighted, step > 0 ? -1 : 0) + step + suggestions.length) % suggestions.length;
  }

  function onKeydown(event: KeyboardEvent): void {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);

      return;
    }

    if (event.key === "Enter" || event.key === ",") {
      const chosen = event.key === "Enter" ? suggestions[highlighted] : undefined;

      if (chosen || text.trim()) {
        event.preventDefault();
        add(chosen?.name ?? text);
      }

      return;
    }

    if (event.key === "Backspace" && !text && tags.length) {
      remove(tags.at(-1)!);
    }
  }
</script>

<div class="field" class:focused>
  {#each tags as tag (tag)}
    <span class="chip">
      {tag}
      <button class="chip-remove" type="button" aria-label={i18n.t("editor.removeTag", { tag })} onclick={() => {
        remove(tag);
        // The chip's button goes away with it.
        input?.focus();
      }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.3 5.3a1 1 0 1 1 1.4 1.4L13.42 12l5.3 5.3a1 1 0 0 1-1.42 1.4L12 13.42l-5.3 5.3a1 1 0 0 1-1.4-1.42L10.58 12l-5.3-5.3a1 1 0 0 1 1.42-1.4L12 10.58l5.3-5.3Z" /></svg>
      </button>
    </span>
  {/each}
  <input
    bind:this={input}
    {id}
    bind:value={text}
    class="input"
    type="text"
    autocomplete="off"
    placeholder={tags.length ? "" : i18n.t("editor.tagsPlaceholder")}
    aria-label={label}
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={suggestions.length > 0}
    aria-controls={suggestions.length ? listId : undefined}
    aria-activedescendant={suggestions[highlighted] ? `${listId}-${highlighted}` : undefined}
    onkeydown={onKeydown}
    oninput={() => {
      dismissed = false;
      highlighted = -1;
    }}
    onfocus={() => {
      focused = true;
    }}
    onblur={() => {
      focused = false;

      if (text.trim()) {
        add(text);
      }
    }}
  />
  {#if suggestions.length}
    <ul class="suggestions" id={listId} role="listbox" aria-label={label}>
      {#each suggestions as suggestion, i (suggestion.id)}
        <li
          id="{listId}-{i}"
          class="suggestion"
          class:highlighted={i === highlighted}
          role="option"
          aria-selected={i === highlighted}
          onpointerdown={(event) => {
            // Keep the field focused so the click lands.
            event.preventDefault();
            add(suggestion.name);
          }}
        >
          {suggestion.name}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .field {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-height: var(--control-input-height-md, 40px);
    padding: 4px 8px;
    border: 1px solid var(--input-border-default, var(--nf-border, #3f4147));
    border-radius: var(--radius-sm, 8px);
    background-color: var(--input-background-default, rgb(0 0 0 / 8%));
    color: var(--input-text-default, var(--nf-text, #dbdee1));
    transition: border-color 0.1s;
  }

  .field:hover:not(.focused) {
    border-color: var(--input-border-hover, var(--nf-border, #3f4147));
  }

  .field.focused {
    border-color: var(--input-border-active, var(--nf-accent, #5865f2));
    outline: 2px solid var(--input-border-active, var(--nf-accent, #5865f2));
    outline-offset: -2px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 24px;
    padding: 0 4px 0 8px;
    border-radius: var(--radius-xs, 4px);
    background-color: var(--background-mod-normal, rgb(151 151 159 / 16%));
    color: var(--text-default, var(--nf-text, #dbdee1));
    font-size: 14px;
    line-height: 18px;
  }

  .chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: var(--radius-xs, 4px);
    background: none;
    cursor: pointer;
  }

  .chip-remove svg {
    width: 12px;
    height: 12px;
    fill: var(--interactive-icon-default, var(--nf-muted, #949ba4));
  }

  .chip-remove:hover svg {
    fill: var(--interactive-icon-hover, var(--nf-text, #fff));
  }

  .input {
    flex: 1;
    min-width: 80px;
    height: 30px;
    padding: 0 4px;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 16px;
    outline: none;
  }

  .input::placeholder {
    color: var(--input-placeholder-text-default, var(--nf-muted, #949ba4));
  }

  .suggestions {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    left: 0;
    z-index: 1;
    margin: 0;
    padding: 6px;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-surface-higher, var(--nf-bg-elevated, #2b2d31));
    box-shadow: 0 8px 16px rgb(0 0 0 / 24%);
    list-style: none;
  }

  .suggestion {
    padding: 6px 8px;
    border-radius: var(--radius-xs, 4px);
    color: var(--text-default, var(--nf-text, #dbdee1));
    font-size: 14px;
    line-height: 18px;
    cursor: pointer;
  }

  .suggestion.highlighted,
  .suggestion:hover {
    background-color: var(--background-mod-subtle, rgb(151 151 159 / 12%));
    color: var(--interactive-text-active, #fff);
  }
</style>
