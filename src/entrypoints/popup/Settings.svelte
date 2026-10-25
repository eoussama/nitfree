<!--
  The popup's settings page: the sizes emojis and stickers are sent at, what a click on an item does,
  whether animated items play in the panel, whether typing `:name` suggests Nitfree items, and where,
  and the keyboard shortcut that opens the panel. Each change is saved at once, and open Discord tabs
  follow it. Its end links to the diagnostics page.
-->
<script lang="ts">
  import type { TClickAction, TSendSizes, TSuggestionsAt } from "~/lib/settings";
  import type { TShortcut } from "~/lib/shortcut";

  import { autocomplete, clampSendSize, clickAction, DEFAULT_SEND_SIZES, playAnimations, SEND_SIZE_LIMITS, sendSizes, shortcut, shortcutKeys, suggestionsAt } from "~/lib/settings";
  import { DEFAULT_SHORTCUT, formatShortcut, isMac, isUsableShortcut, shortcutKeys as keysOf, shortcutOf } from "~/lib/shortcut";



  const { onopen }: { onopen?: (page: "diagnostics") => void } = $props();

  const SIZE_KINDS: (keyof TSendSizes)[] = ["emoji", "sticker"];
  const CLICK_ACTIONS: TClickAction[] = ["send", "add"];
  const SUGGESTION_PLACES: TSuggestionsAt[] = ["end", "start"];

  let sizes: TSendSizes = $state({ ...DEFAULT_SEND_SIZES });
  let action: TClickAction = $state("send");
  let play = $state(true);
  let suggest = $state(true);
  let at: TSuggestionsAt = $state("end");
  let useShortcut = $state(true);
  let keys: TShortcut = $state(DEFAULT_SHORTCUT);

  // While recording: the modifiers held so far, and why the last combination was refused.
  let recording = $state(false);
  let held: TShortcut | null = $state(null);
  let refused = $state(false);

  const mac = isMac();
  const shown = $derived(recording ? held : keys);

  $effect(() => {
    void sendSizes.getValue().then((value) => {
      sizes = value;
    });
    void clickAction.getValue().then((value) => {
      action = value;
    });
    void playAnimations.getValue().then((value) => {
      play = value;
    });
    void autocomplete.getValue().then((value) => {
      suggest = value;
    });
    void suggestionsAt.getValue().then((value) => {
      at = value;
    });
    void shortcut.getValue().then((value) => {
      useShortcut = value;
    });
    void shortcutKeys.getValue().then((value) => {
      keys = value;
    });

    const stops = [
      sendSizes.watch((value) => {
        sizes = value ?? DEFAULT_SEND_SIZES;
      }),
      clickAction.watch((value) => {
        action = value ?? "send";
      }),
      playAnimations.watch((value) => {
        play = value ?? true;
      }),
      autocomplete.watch((value) => {
        suggest = value ?? true;
      }),
      suggestionsAt.watch((value) => {
        at = value ?? "end";
      }),
      shortcut.watch((value) => {
        useShortcut = value ?? true;
      }),
      shortcutKeys.watch((value) => {
        keys = value ?? DEFAULT_SHORTCUT;
      }),
    ];

    return () => stops.forEach(stop => stop());
  });

  // A size out of range is brought within it; one that is not a number puts the saved size back.
  function saveSize(kind: keyof TSendSizes, input: HTMLInputElement): void {
    const size = clampSendSize(kind, input.valueAsNumber);

    input.value = String(size ?? sizes[kind]);

    if (size !== null && size !== sizes[kind]) {
      sizes = { ...sizes, [kind]: size };
      void sendSizes.setValue($state.snapshot(sizes));
    }
  }

  function saveAction(value: TClickAction): void {
    action = value;
    void clickAction.setValue(value);
  }

  function savePlay(value: boolean): void {
    play = value;
    void playAnimations.setValue(value);
  }

  function saveSuggest(value: boolean): void {
    suggest = value;
    void autocomplete.setValue(value);
  }

  function saveAt(value: TSuggestionsAt): void {
    at = value;
    void suggestionsAt.setValue(value);
  }

  function saveUseShortcut(value: boolean): void {
    useShortcut = value;
    recording = false;
    void shortcut.setValue(value);
  }

  function saveKeys(value: TShortcut): void {
    keys = value;
    void shortcutKeys.setValue(value);
  }

  function startRecording(): void {
    recording = true;
    held = null;
    refused = false;
  }

  function stopRecording(): void {
    recording = false;
    held = null;
    refused = false;
  }

  // While recording, every key press is taken: Escape on its own stops, and the first key pressed
  // with Ctrl, Alt or Command becomes the shortcut.
  $effect(() => {
    if (!recording) {
      return;
    }

    const onKeydown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();

      const combination = shortcutOf(event);
      const modifiers = { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey };

      if (combination?.key === "Escape" && !modifiers.ctrl && !modifiers.alt && !modifiers.shift && !modifiers.meta) {
        stopRecording();

        return;
      }

      if (!combination) {
        held = { key: "", ...modifiers };

        return;
      }

      if (!isUsableShortcut(combination)) {
        held = null;
        refused = true;

        return;
      }

      saveKeys(combination);
      stopRecording();
    };
    const onKeyup = (event: KeyboardEvent): void => {
      held = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey ? { key: "", ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey } : null;
    };

    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("keyup", onKeyup, true);

    return () => {
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("keyup", onKeyup, true);
    };
  });
</script>

<div class="form-section">
  <h2 class="form-title">{i18n.t("popup.sizes")}</h2>
  <p class="form-description">{i18n.t("popup.sizesHint")}</p>
  <div class="sizes">
    {#each SIZE_KINDS as kind (kind)}
      <label>
        <span class="form-label">{i18n.t(`panel.types.${kind}`)}</span>
        <span class="number">
          <input
            class="input"
            type="number"
            inputmode="numeric"
            min={SEND_SIZE_LIMITS[kind].min}
            max={SEND_SIZE_LIMITS[kind].max}
            step="1"
            value={sizes[kind]}
            onchange={event => saveSize(kind, event.currentTarget)}
          />
          <span class="unit" aria-hidden="true">px</span>
        </span>
      </label>
    {/each}
  </div>
</div>

<div class="form-section">
  <fieldset class="group">
    <legend class="form-title">{i18n.t("popup.click")}</legend>
    <p class="form-description">{i18n.t("popup.clickHint")}</p>
    <div class="options">
      {#each CLICK_ACTIONS as value (value)}
        <label class="option">
          <input class="radio" type="radio" name="nf-click" {value} checked={action === value} onchange={() => saveAction(value)} />
          <span>{value === "send" ? i18n.t("popup.clickSend") : i18n.t("popup.clickAdd")}</span>
        </label>
      {/each}
    </div>
  </fieldset>
</div>

<div class="form-section">
  <label class="toggle">
    <span>{i18n.t("popup.animations")}</span>
    <input class="switch" type="checkbox" role="switch" checked={play} onchange={event => savePlay(event.currentTarget.checked)} />
  </label>
</div>

<div class="form-section">
  <label class="toggle">
    <span>{i18n.t("popup.autocomplete")}</span>
    <input class="switch" type="checkbox" role="switch" checked={suggest} onchange={event => saveSuggest(event.currentTarget.checked)} />
  </label>
  <p class="form-description">{i18n.t("popup.autocompleteHint")}</p>
  <fieldset class="group" disabled={!suggest}>
    <legend class="form-label">{i18n.t("popup.suggestionsAt")}</legend>
    <div class="options">
      {#each SUGGESTION_PLACES as value (value)}
        <label class="option">
          <input class="radio" type="radio" name="nf-suggestions-at" {value} checked={at === value} onchange={() => saveAt(value)} />
          <span>{value === "end" ? i18n.t("popup.suggestionsAtEnd") : i18n.t("popup.suggestionsAtStart")}</span>
        </label>
      {/each}
    </div>
  </fieldset>
</div>

<div class="form-section">
  <label class="toggle">
    <span>{i18n.t("popup.shortcut")}</span>
    <input class="switch" type="checkbox" role="switch" checked={useShortcut} onchange={event => saveUseShortcut(event.currentTarget.checked)} />
  </label>
  <p class="form-description">{i18n.t("popup.shortcutHint")}</p>
  <fieldset class="group" disabled={!useShortcut}>
    <legend class="form-label">{i18n.t("popup.shortcutKeys")}</legend>
    <!-- As a row of Discord's keybind settings: what it does, and its keys as chips at the end. -->
    <div class="keybind" class:recording>
      <span>{i18n.t("toggler.label")}</span>
      <span class="combo" data-shortcut aria-live="polite">
        {#if shown}
          {#each keysOf(shown, mac).filter(Boolean) as key, index (index)}<kbd class="key">{key}</kbd>{/each}
        {:else}
          <span class="prompt">{i18n.t("popup.shortcutRecording")}</span>
        {/if}
      </span>
    </div>
    {#if refused}
      <p class="feedback critical" role="alert">{mac ? i18n.t("popup.shortcutModifierMac") : i18n.t("popup.shortcutModifier")}</p>
    {/if}
    <div class="actions">
      {#if recording}
        <!-- Focused as it shows, in place of Change; leaving it stops recording. -->
        <button class="button secondary" type="button" onclick={stopRecording} onblur={stopRecording} {@attach node => node.focus()}>{i18n.t("editor.cancel")}</button>
      {:else}
        {#if formatShortcut(keys, mac) !== formatShortcut(DEFAULT_SHORTCUT, mac)}
          <button class="button secondary" type="button" onclick={() => saveKeys(DEFAULT_SHORTCUT)}>{i18n.t("popup.shortcutReset")}</button>
        {/if}
        <button class="button secondary" type="button" onclick={startRecording}>{i18n.t("popup.shortcutChange")}</button>
      {/if}
    </div>
  </fieldset>
</div>

<div class="form-section">
  <h2 class="form-title">{i18n.t("diagnostics.heading")}</h2>
  <p class="form-description">{i18n.t("diagnostics.settingsHint")}</p>
  <div class="actions">
    <button class="button secondary" type="button" data-page="diagnostics" onclick={() => onopen?.("diagnostics")}>{i18n.t("diagnostics.open")}</button>
  </div>
</div>

<style>
  .group {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  /* A legend does not take margins like a heading; float it so the description sits under it. */
  .group > legend {
    float: left;
    width: 100%;
    padding: 0;
  }

  .group > legend + * {
    clear: left;
  }

  /* A row of Discord's keybind settings: a filled box, the action's name, then its keys. */
  .keybind {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 56px;
    padding: 12px 16px;
    box-sizing: border-box;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-mod-subtle, var(--nf-mod-subtle));
    color: var(--text-default, var(--nf-text));
    font-size: 16px;
    font-weight: 500;
    line-height: 20px;
  }

  /* Recording, it takes the focus ring of a field being typed in. */
  .keybind.recording {
    outline: 2px solid var(--input-border-active, var(--nf-accent));
    outline-offset: -2px;
  }

  .group:disabled .keybind {
    opacity: 0.5;
  }

  .combo {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
  }

  /* Discord's key chip: bold capitals on a darker cap with a raised bottom edge. */
  .key {
    min-width: 20px;
    padding: 2px 6px;
    box-sizing: border-box;
    border: 1px solid var(--border-subtle, rgb(151 151 159 / 20%));
    border-radius: 4px;
    background-color: var(--background-base-lowest, rgb(0 0 0 / 20%));
    color: var(--text-strong, var(--nf-text));
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    text-transform: uppercase;
    box-shadow: inset 0 -1px 0 var(--border-subtle, rgb(151 151 159 / 20%));
  }

  .prompt {
    color: var(--text-muted, var(--nf-muted));
    font-size: 14px;
    line-height: 18px;
  }

  .sizes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .number {
    position: relative;
    display: flex;
  }

  .number .input {
    padding-inline-end: 32px;
  }

  .unit {
    position: absolute;
    inset-inline-end: 12px;
    top: 50%;
    color: var(--nf-muted);
    font-size: 14px;
    transform: translateY(-50%);
    pointer-events: none;
  }
</style>
