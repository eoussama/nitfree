<svelte:options css="injected" />

<!--
  The add and edit dialog, styled like a Discord modal: title, one row per file with its preview and
  details, and a footer with Cancel and the primary action.
-->
<script lang="ts">
  import type { TItemType } from "~/lib/db";
  import type { TDraft } from "~/lib/ui/editor.svelte";

  import X from "@lucide/svelte/icons/x";
  import { tick } from "svelte";

  // Not from "~/lib/db": that would bundle Dexie into the content script, and Chrome refuses its "\uffff" key bound as invalid UTF-8.
  import { ITEM_TYPES } from "~/lib/db/types";
  import { ACCEPTED_FILES } from "~/lib/ui/drafts";
  import { closeEditor, editor, isUsable, removeDraft, replaceFile, saveEditor } from "~/lib/ui/editor.svelte";
  import { library } from "~/lib/ui/library.svelte";

  import TagInput from "./TagInput.svelte";



  let dialog: HTMLElement | undefined = $state();

  const usable = $derived(editor.drafts.filter(isUsable));
  const heading = $derived(editor.mode === "edit" ? i18n.t("editor.editTitle") : i18n.t("editor.addTitle"));
  const action = $derived(editor.mode === "edit" ? i18n.t("editor.save") : i18n.t("editor.addCount", usable.length));

  // Focus the first name to change, or the dialog's first button when no file can be added.
  function focusFirst(): void {
    const title = dialog?.querySelector<HTMLInputElement>("input[data-title]");

    if (title) {
      title.select();
    }
    else {
      dialog?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    }
  }

  $effect(() => {
    if (editor.mode && dialog) {
      focusFirst();
    }
  });

  async function onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    // Every field is disabled while saving, so the dialog holds focus; files that failed get it back.
    dialog?.focus();

    if (!(await saveEditor()) && editor.mode) {
      await tick();
      focusFirst();
    }
  }

  async function remove(draft: TDraft): Promise<void> {
    removeDraft(draft);

    if (editor.mode) {
      await tick();
      focusFirst();
    }
  }

  function pickReplacement(draft: TDraft, input: HTMLInputElement): void {
    const file = input.files?.[0];

    if (file) {
      void replaceFile(draft, file);
    }

    input.value = "";
  }

  function setType(draft: TDraft, type: TItemType): void {
    draft.type = type;
  }
</script>

{#if editor.mode}
  <div class="backdrop" aria-hidden="true" onpointerdown={() => !editor.saving && closeEditor()}></div>
  <div bind:this={dialog} class="modal" role="dialog" aria-modal="true" aria-labelledby="nf-editor-title" tabindex="-1">
    <form class="form" onsubmit={event => void onSubmit(event)}>
      <header class="modal-header">
        <h2 class="modal-title" id="nf-editor-title">{heading}</h2>
        <button class="close" type="button" aria-label={i18n.t("editor.cancel")} disabled={editor.saving} onclick={closeEditor}>
          <X size={24} aria-hidden="true" />
        </button>
      </header>

      <div class="modal-content">
        {#each editor.drafts as draft (draft.key)}
          <fieldset class="draft" class:unusable={!isUsable(draft)} disabled={editor.saving}>
            <legend class="sr-only">{draft.file?.name ?? draft.title}</legend>

            <div class="preview">
              {#if draft.url}
                <img src={draft.url} alt="" />
              {/if}
            </div>

            <div class="fields">
              {#if draft.error}
                <p class="draft-error" role="alert">{draft.error}</p>
              {/if}

              {#if draft.info}
                <label class="field">
                  <span class="label">{i18n.t("editor.title")}</span>
                  <input class="input" type="text" required data-title bind:value={draft.title} />
                </label>

                <div class="field" role="radiogroup" aria-label={i18n.t("editor.type")}>
                  <span class="label" aria-hidden="true">{i18n.t("editor.type")}</span>
                  <div class="segments">
                    {#each ITEM_TYPES as type (type)}
                      <button
                        class="segment"
                        class:selected={draft.type === type}
                        type="button"
                        role="radio"
                        aria-checked={draft.type === type}
                        onclick={() => setType(draft, type)}
                      >
                        {i18n.t(`panel.types.${type}`)}
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="field">
                  <label class="label" for="nf-tags-{draft.key}">{i18n.t("editor.tags")}</label>
                  <TagInput bind:tags={draft.tags} available={library.tags} id="nf-tags-{draft.key}" label={i18n.t("editor.tags")} />
                </div>

                <label class="field">
                  <span class="label">{i18n.t("editor.description")}</span>
                  <textarea class="input textarea" rows="2" placeholder={i18n.t("editor.optional")} bind:value={draft.description}></textarea>
                </label>
              {/if}

              <div class="draft-actions">
                {#if editor.mode === "edit"}
                  <label class="link">
                    {i18n.t("editor.replace")}
                    <input class="sr-only" type="file" accept={ACCEPTED_FILES} onchange={event => pickReplacement(draft, event.currentTarget)} />
                  </label>
                {:else if editor.drafts.length > 1 || draft.error}
                  <button class="link" type="button" onclick={() => void remove(draft)}>{i18n.t("editor.remove")}</button>
                {/if}
              </div>
            </div>
          </fieldset>
        {/each}
      </div>

      <footer class="modal-footer">
        {#if editor.error}
          <p class="footer-error" role="alert">{editor.error}</p>
        {/if}
        <button class="button secondary" type="button" disabled={editor.saving} onclick={closeEditor}>{i18n.t("editor.cancel")}</button>
        <button class="button primary" type="submit" disabled={editor.saving || editor.reading > 0 || !usable.length}>{action}</button>
      </footer>
    </form>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background-color: var(--background-scrim, rgb(0 0 0 / 72%));
    pointer-events: auto;
  }

  .form {
    display: contents;
  }

  .modal:focus {
    outline: none;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: min(var(--modal-width-medium, 602px), calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
    border-radius: var(--radius-md, 12px);
    background-color: var(--modal-background, var(--nf-bg-elevated, #2b2d31));
    color: var(--text-default, var(--nf-text, #dbdee1));
    font-family: var(--font-primary, inherit);
    box-shadow: 0 16px 48px rgb(0 0 0 / 32%);
    transform: translate(-50%, -50%);
    pointer-events: auto;
  }

  .modal :global(*) {
    box-sizing: border-box;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: var(--modal-vertical-padding, 16px) var(--modal-horizontal-padding, 24px) 8px;
  }

  .modal-title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 24px;
    color: var(--text-strong, var(--nf-text, #fff));
  }

  .close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background: none;
    cursor: pointer;
  }

  .close {
    color: var(--interactive-icon-default, var(--nf-muted, #949ba4));
  }

  .close:hover {
    color: var(--interactive-icon-hover, #fff);
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px var(--modal-horizontal-padding, 24px) 16px;
    overflow-y: auto;
  }

  .draft {
    display: flex;
    gap: 16px;
    margin: 0;
    padding: 0;
    border: none;
  }

  .draft + .draft {
    padding-top: 16px;
    border-top: 1px solid var(--border-subtle, var(--nf-border, #3f4147));
  }

  .preview {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 96px;
    height: 96px;
    overflow: hidden;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--background-base-lower, rgb(0 0 0 / 16%));
  }

  .preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .fields {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .label {
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    color: var(--text-default, var(--nf-text, #dbdee1));
  }

  .input {
    width: 100%;
    height: var(--control-input-height-md, 40px);
    padding: 0 12px;
    border: 1px solid var(--input-border-default, var(--nf-border, #3f4147));
    border-radius: var(--radius-sm, 8px);
    background-color: var(--input-background-default, rgb(0 0 0 / 8%));
    color: var(--input-text-default, var(--nf-text, #dbdee1));
    font: inherit;
    font-size: 16px;
    line-height: 20px;
    outline: none;
    transition: border-color 0.1s;
  }

  .input:hover:not(:focus) {
    border-color: var(--input-border-hover, var(--nf-border, #3f4147));
  }

  .input:focus {
    border-color: var(--input-border-active, var(--nf-accent, #5865f2));
    outline: 2px solid var(--input-border-active, var(--nf-accent, #5865f2));
    outline-offset: -2px;
  }

  .input::placeholder {
    color: var(--input-placeholder-text-default, var(--nf-muted, #949ba4));
  }

  .textarea {
    height: auto;
    min-height: 64px;
    padding: 10px 12px;
    resize: vertical;
  }

  .segments {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-sm, 8px);
    background-color: var(--input-background-default, rgb(0 0 0 / 8%));
  }

  .segment {
    flex: 1;
    height: 32px;
    padding: 0 8px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--interactive-text-default, var(--nf-muted, #b5bac1));
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.1s ease-in-out, color 0.1s ease-in-out;
  }

  .segment:hover {
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
    color: var(--interactive-text-hover, #fff);
  }

  .segment.selected {
    background-color: var(--background-mod-normal, rgb(151 151 159 / 16%));
    color: var(--text-strong, #fff);
  }

  .draft-error,
  .footer-error {
    margin: 0;
    font-size: 14px;
    line-height: 18px;
    color: var(--text-feedback-critical, #f57976);
  }

  .footer-error {
    flex: 1;
  }

  .draft-actions {
    display: flex;
  }

  .link {
    padding: 0;
    border: none;
    background: none;
    color: var(--text-link, #5cabff);
    font: inherit;
    font-size: 14px;
    line-height: 18px;
    cursor: pointer;
  }

  .link:hover {
    text-decoration: underline;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px var(--modal-horizontal-padding, 24px);
    background-color: var(--modal-footer-background, var(--nf-bg, #313338));
  }

  .button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 96px;
    height: 40px;
    padding: 7px 15px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 8px);
    font: inherit;
    font-size: 16px;
    font-weight: 500;
    line-height: 20px;
    cursor: pointer;
    transition: background-color 0.15s ease-out, border-color 0.15s ease-out, color 0.15s ease-out;
  }

  .button:disabled,
  .close:disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .secondary {
    border-color: var(--control-secondary-border-default, transparent);
    background-color: var(--control-secondary-background-default, rgb(151 151 159 / 12%));
    color: var(--control-secondary-text-default, #fff);
  }

  .secondary:hover {
    border-color: var(--control-secondary-border-hover, transparent);
    background-color: var(--control-secondary-background-hover, rgb(151 151 159 / 16%));
  }

  .primary {
    border-color: var(--control-primary-border-default, transparent);
    background-color: var(--control-primary-background-default, var(--nf-accent, #5865f2));
    color: var(--control-primary-text-default, #fff);
  }

  .primary:hover {
    border-color: var(--control-primary-border-hover, transparent);
    background-color: var(--control-primary-background-hover, #4752c4);
  }

  .primary:active {
    background-color: var(--control-primary-background-active, #3c45a5);
  }

  .button:focus-visible,
  .segment:focus-visible,
  .close:focus-visible,
  .link:focus-visible,
  .link:has(input:focus-visible) {
    outline: 2px solid var(--border-focus, var(--nf-accent, #5865f2));
    outline-offset: 2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Narrow windows, such as the popup, stack each file's preview above its fields. */
  @media (max-width: 480px) {
    .draft {
      flex-direction: column;
    }

    .modal-header,
    .modal-content,
    .modal-footer {
      padding-inline: 16px;
    }
  }
</style>
