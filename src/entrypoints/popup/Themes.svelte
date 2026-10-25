<!--
  The popup's themes page: Discord's own look, changed in every Discord tab at once. A color theme
  puts a gradient behind Discord, as Nitro's do, an accent color replaces Discord's blurple, and CSS
  snippets add styles on top of Discord's, each turned on or off on its own. Changes are saved as
  they are made, and the panel follows the colors that result.
-->
<script lang="ts">
  import type { TColorTheme, TSnippet } from "~/lib/theme";

  import Ban from "@lucide/svelte/icons/ban";
  import Check from "@lucide/svelte/icons/check";

  import { accentColor, colorTheme, cssSnippets } from "~/lib/settings";
  import { ACCENT_PATTERN, COLOR_THEMES, findColorTheme, SNIPPET_CSS_MAX, SNIPPET_NAME_MAX } from "~/lib/theme";
  import { tooltip } from "~/lib/ui/tooltip.svelte";

  import Confirm from "./Confirm.svelte";



  const DISCORD_ACCENT = "#5865f2";

  /**
   * How long typing in a snippet waits before it is saved, and so applied.
   */
  const SAVE_DELAY = 300;

  let themeId: string | null = $state(null);
  let accent: string | null = $state(null);
  // The color last picked, kept while the override is off so turning it on again brings it back.
  let picked = $state(DISCORD_ACCENT);
  let hex = $state(DISCORD_ACCENT);
  let snippets: TSnippet[] = $state([]);
  let editingId: string | null = $state(null);
  let confirming = $state(false);

  // What this page last saved, so the change it hears back from storage is not taken for another tab's.
  let saved = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const editing = $derived(snippets.find(snippet => snippet.id === editingId) ?? null);

  $effect(() => {
    const showAccent = (value: string | null): void => {
      accent = value;

      if (value) {
        picked = hex = value;
      }
    };
    const showSnippets = (value: TSnippet[]): void => {
      if (JSON.stringify(value) !== saved) {
        snippets = value;
      }
    };

    const showTheme = (value: string | null): void => {
      themeId = findColorTheme(value)?.id ?? null;
    };

    void colorTheme.getValue().then(showTheme);
    void accentColor.getValue().then(showAccent);
    void cssSnippets.getValue().then(showSnippets);

    const stops = [
      colorTheme.watch(value => showTheme(value ?? null)),
      accentColor.watch(value => showAccent(value ?? null)),
      cssSnippets.watch(value => showSnippets(value ?? [])),
    ];

    return () => {
      stops.forEach(stop => stop());
      flush();
    };
  });

  function saveTheme(value: TColorTheme | null): void {
    themeId = value?.id ?? null;
    void colorTheme.setValue(themeId);
  }

  function gradientOf(theme: TColorTheme): string {
    return `linear-gradient(${theme.angle}deg, ${theme.colors.join(", ")})`;
  }

  function saveAccent(value: string | null): void {
    accent = value;
    void accentColor.setValue(value);
  }

  function pick(value: string): void {
    picked = hex = value.toLowerCase();
    saveAccent(picked);
  }

  // A typed color applies once it is whole; anything else puts the last one back.
  function typeHex(value: string): void {
    const color = value.startsWith("#") ? value : `#${value}`;

    if (ACCENT_PATTERN.test(color)) {
      pick(color);
    }
    else {
      hex = picked;
    }
  }

  function flush(): void {
    if (timer === undefined) {
      return;
    }

    clearTimeout(timer);
    timer = undefined;
    saved = JSON.stringify($state.snapshot(snippets));
    void cssSnippets.setValue($state.snapshot(snippets));
  }

  // Switching one on or off saves at once; typing waits for a pause.
  function save(now: boolean): void {
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);

    if (now) {
      flush();
    }
  }

  function add(): void {
    const snippet: TSnippet = { id: crypto.randomUUID(), name: "", css: "", enabled: true };

    snippets = [...snippets, snippet];
    editingId = snippet.id;
    save(true);
  }

  function toggle(snippet: TSnippet, enabled: boolean): void {
    snippet.enabled = enabled;
    save(true);
  }

  function remove(snippet: TSnippet): void {
    confirming = false;
    editingId = null;
    snippets = snippets.filter(found => found.id !== snippet.id);
    save(true);
  }

  function nameOf(snippet: TSnippet): string {
    return snippet.name.trim() || i18n.t("popup.themes.untitled");
  }
</script>

<div class="form-section">
  <h2 id="nf-color-themes" class="form-title">{i18n.t("popup.themes.colors")}</h2>
  <p class="form-description">{i18n.t("popup.themes.colorsHint")}</p>
  <div class="swatches" role="radiogroup" aria-labelledby="nf-color-themes">
    {@render swatch(null, i18n.t("popup.themes.default"))}
    {#each COLOR_THEMES as theme (theme.id)}
      {@render swatch(theme, i18n.t(`popup.themes.names.${theme.id}`))}
    {/each}
  </div>
</div>

{#snippet swatch(theme: TColorTheme | null, name: string)}
  {@const selected = (theme?.id ?? null) === themeId}
  <label class="theme" class:default={!theme} style:background-image={theme ? gradientOf(theme) : null} {@attach tooltip(name)}>
    <input type="radio" name="nf-color-theme" value={theme?.id ?? ""} checked={selected} aria-label={name} onchange={() => saveTheme(theme)} />
    {#if !theme}<Ban size={24} aria-hidden="true" />{/if}
    {#if selected}<span class="badge" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>{/if}
  </label>
{/snippet}

<div class="form-section">
  <label class="toggle">
    <span>{i18n.t("popup.themes.accent")}</span>
    <input class="switch" type="checkbox" role="switch" checked={accent !== null} onchange={event => saveAccent(event.currentTarget.checked ? picked : null)} />
  </label>
  <p class="form-description">{i18n.t("popup.themes.accentHint")}</p>
  {#if accent !== null}
    <div class="color">
      <input class="swatch" type="color" aria-label={i18n.t("popup.themes.pickColor")} value={picked} oninput={event => pick(event.currentTarget.value)} />
      <label class="hex">
        <span class="form-label">{i18n.t("popup.themes.accentColor")}</span>
        <input class="input" type="text" spellcheck="false" autocomplete="off" maxlength="7" bind:value={hex} onchange={event => typeHex(event.currentTarget.value.trim())} />
      </label>
    </div>
    {#if picked !== DISCORD_ACCENT}
      <div class="actions">
        <button class="button secondary" type="button" onclick={() => pick(DISCORD_ACCENT)}>{i18n.t("popup.shortcutReset")}</button>
      </div>
    {/if}
  {/if}
</div>

<div class="form-section">
  <h2 id="nf-snippets" class="form-title">{i18n.t("popup.themes.snippets")}</h2>
  <p class="form-description">{i18n.t("popup.themes.snippetsHint")}</p>
  {#if snippets.length}
    <ul class="snippets" aria-labelledby="nf-snippets">
      {#each snippets as snippet (snippet.id)}
        <li class="snippet" class:editing={snippet.id === editingId}>
          <span class="name">{nameOf(snippet)}</span>
          <button class="button secondary" type="button" aria-label={i18n.t("popup.themes.edit", { name: nameOf(snippet) })} aria-expanded={snippet.id === editingId} onclick={() => (editingId = snippet.id === editingId ? null : snippet.id)}>
            {i18n.t("menu.edit")}
          </button>
          <input class="switch" type="checkbox" role="switch" aria-label={nameOf(snippet)} checked={snippet.enabled} onchange={event => toggle(snippet, event.currentTarget.checked)} />
        </li>
      {/each}
    </ul>
  {:else}
    <p class="form-description" role="status">{i18n.t("popup.themes.none")}</p>
  {/if}
  <div class="actions">
    <button class="button primary" type="button" onclick={add}>{i18n.t("popup.themes.new")}</button>
  </div>
</div>

{#if editing}
  {#key editing.id}
    <div class="form-section" role="group" aria-label={nameOf(editing)}>
      <label>
        <span class="form-label">{i18n.t("editor.title")}</span>
        <input class="input" type="text" autocomplete="off" maxlength={SNIPPET_NAME_MAX} placeholder={i18n.t("popup.themes.untitled")} bind:value={editing.name} oninput={() => save(false)} {@attach node => node.focus()} />
      </label>
      <label class="css">
        <span class="form-label">{i18n.t("popup.themes.css")}</span>
        <textarea class="input code" rows="8" spellcheck="false" autocomplete="off" maxlength={SNIPPET_CSS_MAX} bind:value={editing.css} oninput={() => save(false)}></textarea>
      </label>
      <p class="form-description">{i18n.t("popup.themes.cssHint")}</p>
      <div class="actions">
        <button class="button critical" type="button" onclick={() => (confirming = true)}>{i18n.t("menu.delete")}</button>
        <button class="button secondary" type="button" onclick={() => (editingId = null)}>{i18n.t("popup.themes.done")}</button>
      </div>
    </div>
  {/key}
{/if}

<Confirm
  open={confirming && editing !== null}
  title={i18n.t("popup.themes.confirmTitle", { name: editing ? nameOf(editing) : "" })}
  body={i18n.t("popup.themes.confirm")}
  action={i18n.t("popup.themes.confirmDelete")}
  onconfirm={() => editing && remove(editing)}
  oncancel={() => (confirming = false)}
/>

<style>
  /* Discord's theme picker: rounded squares of each gradient, the chosen one ringed and ticked. */
  .swatches {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    padding: 4px;
  }

  /* The five columns share the row, so no space is left over at its end. */
  .theme {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    box-sizing: border-box;
    border: 1px solid var(--border-subtle, var(--nf-border));
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-base-lower, var(--nf-bg));
    color: var(--interactive-icon-default, var(--nf-muted));
    cursor: pointer;
  }

  .theme:has(:checked) {
    outline: 2px solid var(--control-brand-foreground-new, var(--nf-accent));
    outline-offset: 2px;
  }

  .theme:has(:focus-visible) {
    outline: 2px solid var(--border-focus, var(--nf-accent));
    outline-offset: 2px;
  }

  /* The real radio stays for keyboards and screen readers; the gradient is what shows. */
  .theme input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  .badge {
    position: absolute;
    top: -8px;
    right: -8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: var(--control-brand-foreground-new, var(--nf-accent));
    color: #fff;
    pointer-events: none;
  }

  .color {
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }

  .hex {
    flex: 1;
  }

  /* The picked color as a round swatch the size of a field, opening the browser's picker. */
  .swatch {
    flex: none;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid var(--input-border-default, var(--nf-border));
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }

  .swatch::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .swatch::-webkit-color-swatch,
  .swatch::-moz-color-swatch {
    border: none;
    border-radius: 50%;
  }

  .swatch:focus-visible {
    outline: 2px solid var(--border-focus, var(--nf-accent));
    outline-offset: 2px;
  }

  .snippets {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A row of Discord's settings: a filled box, the name and switch, then Edit. */
  .snippet {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 12px 16px;
    box-sizing: border-box;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-mod-subtle, var(--nf-mod-subtle));
  }

  .snippet.editing {
    outline: 2px solid var(--control-brand-foreground-new, var(--nf-accent));
    outline-offset: -2px;
  }

  .name {
    flex: 1;
    min-width: 0;
    color: var(--text-strong, var(--nf-text));
    font-size: 16px;
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .css {
    display: block;
    margin-top: 16px;
  }

  .code {
    height: auto;
    min-height: 160px;
    padding: 10px 12px;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 13px;
    line-height: 18px;
    resize: vertical;
    tab-size: 2;
  }
</style>
